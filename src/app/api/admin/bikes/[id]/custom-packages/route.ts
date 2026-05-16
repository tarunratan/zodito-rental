import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const createSchema = z.object({
  label:              z.string().min(1).max(80),
  min_duration_hours: z.number().int().min(0).default(0),
  duration_hours:     z.number().int().min(1).max(8760),
  // For legacy fixed-price mode these are the source of truth. For per-day
  // mode they are auto-computed below from per_day_* and the minimum-day
  // rate (kept in sync so "starting from" displays stay correct).
  price:              z.number().nonnegative().optional(),
  km_limit:           z.number().int().nonnegative().optional(),
  // Per-day pricing mode — when present, the package is priced as
  //   days × per_day_price  (with KM = days × per_day_km_limit).
  per_day_price:      z.number().positive().nullable().optional(),
  per_day_km_limit:   z.number().int().nonnegative().nullable().optional(),
}).refine(d => d.duration_hours > d.min_duration_hours, {
  message: 'Upper bound must be greater than lower bound',
  path: ['duration_hours'],
}).refine(d => (d.per_day_price != null) || (d.price != null), {
  message: 'Either a fixed price OR a per-day price is required',
  path: ['price'],
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ packages: [] });
    await requireAdmin();
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('custom_packages')
      .select('id, label, min_duration_hours, duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active, created_at')
      .eq('bike_id', params.id)
      .order('duration_hours', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packages: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data: ' + parse.error.message }, { status: 400 });

    const supabase = createSupabaseAdmin();

    // When admin chose per-day mode, derive a representative `price` and
    // `km_limit` from the MINIMUM-day count of the range so existing UI
    // surfaces ("starting from ₹X", bracket sort priority) keep working
    // without needing per-day-aware branches everywhere. The actual charge
    // is still computed per-day at booking time inside `calculatePrice`.
    const d = parse.data;
    let priceToStore   = d.price ?? 0;
    let kmLimitToStore = d.km_limit ?? 0;
    if (d.per_day_price != null) {
      const minDays = Math.max(1, Math.ceil((d.min_duration_hours || d.duration_hours) / 24));
      priceToStore   = Math.round(Number(d.per_day_price) * minDays * 100) / 100;
      kmLimitToStore = Math.round(Number(d.per_day_km_limit ?? 0) * minDays);
    }

    const insertRow = {
      bike_id:            params.id,
      label:              d.label,
      min_duration_hours: d.min_duration_hours,
      duration_hours:     d.duration_hours,
      price:              priceToStore,
      km_limit:           kmLimitToStore,
      per_day_price:      d.per_day_price ?? null,
      per_day_km_limit:   d.per_day_km_limit ?? null,
      is_active:          true,
    };

    const { data, error } = await supabase
      .from('custom_packages')
      .insert(insertRow)
      .select('id, label, min_duration_hours, duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active, created_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A custom package with this duration already exists for this bike' }, { status: 409 });
      }
      // CHECK constraint violation — most commonly the historical 30-day cap
      // on `duration_hours`. Surface an actionable message so the admin knows
      // exactly what to do instead of seeing a Postgres error code.
      if (error.code === '23514' || /duration_hours_check/i.test(error.message)) {
        return NextResponse.json({
          error: 'Database is rejecting this package duration. Run migration '
               + '039_custom_package_long_durations.sql in Supabase to allow '
               + 'custom packages longer than 30 days, then save again.',
          duration_hours: insertRow.duration_hours,
          min_duration_hours: insertRow.min_duration_hours,
          db_error: error.message,
        }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    revalidatePath(`/bikes/${params.id}`);
    revalidatePath('/');
    return NextResponse.json({ package: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const pkgId = searchParams.get('pkg_id');
    if (!pkgId) return NextResponse.json({ error: 'pkg_id required' }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('custom_packages')
      .delete()
      .eq('id', pkgId)
      .eq('bike_id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath(`/bikes/${params.id}`);
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
