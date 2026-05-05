import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { TIER_ORDER } from '@/lib/pricing';

export const runtime = 'nodejs';

const ALL_TIERS = TIER_ORDER;

const saveSchema = z.object({
  packages: z.array(z.object({
    tier: z.enum([
      '6hr','12hr','24hr','36hr','48hr','60hr','72hr','96hr','120hr','144hr',
      '2day','3day','7day','15day','30day','weekly_flex','monthly_flex',
    ] as [string, ...string[]]),
    price:    z.number().nonnegative(),
    km_limit: z.number().int().nonnegative(),
  })),
});

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
      supabase.from('bike_packages').select('tier, price, km_limit').eq('bike_id', params.id),
    ]);

    if (bikeRes.error) return NextResponse.json({ error: bikeRes.error.message }, { status: 500 });

    const modelPackages: any[] = (bikeRes.data as any)?.model?.packages ?? [];
    const overrides: any[] = overrideRes.data ?? [];

    const packages = ALL_TIERS.map(tier => {
      const mp = modelPackages.find((p: any) => p.tier === tier) ?? { price: 0, km_limit: 0 };
      const ov = overrides.find((p: any) => p.tier === tier);
      return {
        tier,
        price:         ov ? Number(ov.price)    : Number(mp.price),
        km_limit:      ov ? ov.km_limit          : mp.km_limit,
        is_override:   !!ov,
        model_price:   Number(mp.price),
        model_km_limit: mp.km_limit,
      };
    });

    return NextResponse.json({ packages });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const parse = saveSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();

    await supabase.from('bike_packages').delete().eq('bike_id', params.id);

    if (parse.data.packages.length > 0) {
      const rows = parse.data.packages.map(p => ({
        bike_id:    params.id,
        tier:       p.tier,
        price:      p.price,
        km_limit:   p.km_limit,
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
