import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const createSchema = z.object({
  label:          z.string().min(1).max(80),
  duration_hours: z.number().int().min(1).max(720),
  price:          z.number().nonnegative(),
  km_limit:       z.number().int().nonnegative(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ packages: [] });
    await requireAdmin();
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('custom_packages')
      .select('id, label, duration_hours, price, km_limit, is_active, created_at')
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
    const { data, error } = await supabase
      .from('custom_packages')
      .insert({ bike_id: params.id, ...parse.data, is_active: true })
      .select('id, label, duration_hours, price, km_limit, is_active, created_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A custom package with this duration already exists for this bike' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
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
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
