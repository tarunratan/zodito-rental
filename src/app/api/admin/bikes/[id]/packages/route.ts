import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const TIERS = ['6hr', '12hr', '24hr', '7day', '15day', '30day'] as const;

const saveSchema = z.object({
  packages: z.array(z.object({
    tier: z.enum(TIERS),
    price: z.number().nonnegative(),
    km_limit: z.number().int().nonnegative(),
  })),
});

// GET: return all 5 tiers with current effective price (override or model default)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ packages: [] });
    await requireAdmin();
    const supabase = createSupabaseAdmin();

    const [bikeRes, overrideRes] = await Promise.all([
      supabase
        .from('bikes')
        .select('model:bike_models!inner(packages:bike_model_packages(tier, price, km_limit))')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('bike_packages')
        .select('tier, price, km_limit')
        .eq('bike_id', params.id),
    ]);

    if (bikeRes.error) return NextResponse.json({ error: bikeRes.error.message }, { status: 500 });

    const modelPackages = (bikeRes.data as any)?.model?.packages ?? [];
    const overrides: any[] = overrideRes.data ?? [];

    const packages = TIERS.map(tier => {
      const mp = modelPackages.find((p: any) => p.tier === tier) ?? { price: 0, km_limit: 0 };
      const ov = overrides.find((p: any) => p.tier === tier);
      return {
        tier,
        price: ov ? Number(ov.price) : Number(mp.price),
        km_limit: ov ? ov.km_limit : mp.km_limit,
        is_override: !!ov,
        model_price: Number(mp.price),
        model_km_limit: mp.km_limit,
      };
    });

    return NextResponse.json({ packages });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

// PUT: replace all price overrides for this bike
// Body: { packages: [{tier, price, km_limit}] } — only include tiers to override.
// Tiers NOT in the array revert to model defaults (their overrides are deleted).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const parse = saveSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();

    // Delete all existing overrides for this bike first
    const { error: delError } = await supabase
      .from('bike_packages')
      .delete()
      .eq('bike_id', params.id);

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    // Re-insert only the provided overrides
    if (parse.data.packages.length > 0) {
      const rows = parse.data.packages.map(p => ({
        bike_id: params.id,
        tier: p.tier,
        price: p.price,
        km_limit: p.km_limit,
        updated_at: now,
      }));
      const { error } = await supabase.from('bike_packages').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
