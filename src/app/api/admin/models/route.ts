import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const TIERS = ['12hr', '24hr', '7day', '15day', '30day'] as const;

// Default km limits per tier per category
const KM_LIMITS: Record<string, Record<string, number>> = {
  scooter:      { '12hr': 100, '24hr': 140, '7day': 1000, '15day': 2000, '30day': 4000 },
  bike_sub150:  { '12hr': 120, '24hr': 160, '7day': 1000, '15day': 2000, '30day': 4000 },
  bike_plus150: { '12hr': 130, '24hr': 180, '7day': 1000, '15day': 2000, '30day': 4000 },
};

// Default excess/penalty per category
const DEFAULTS: Record<string, { excess_km_rate: number; late_hourly_penalty: number }> = {
  scooter:      { excess_km_rate: 3,  late_hourly_penalty: 50  },
  bike_sub150:  { excess_km_rate: 4,  late_hourly_penalty: 75  },
  bike_plus150: { excess_km_rate: 5,  late_hourly_penalty: 100 },
};

const schema = z.object({
  display_name: z.string().min(2).max(80),
  category:     z.enum(['scooter', 'bike_sub150', 'bike_plus150']),
  cc:           z.number().int().min(50).max(2000),
  // Pricing for each tier — 15day/30day auto-calculated if omitted
  price_12hr:   z.number().positive(),
  price_24hr:   z.number().positive(),
  price_7day:   z.number().positive(),
  price_15day:  z.number().positive().optional(),
  price_30day:  z.number().positive().optional(),
});

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    if (isMockMode()) {
      return NextResponse.json({
        ok: true,
        model: { id: 'mock-model-' + Date.now(), display_name: 'Mock Model', category: 'scooter', cc: 110, name: 'mock' },
        mock: true,
      });
    }

    await requireAdmin();
    const parse = schema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid form', details: parse.error.flatten() }, { status: 400 });

    const { display_name, category, cc, price_12hr, price_24hr, price_7day } = parse.data;
    const price_15day = parse.data.price_15day ?? Math.round(price_7day * 1.9 / 50) * 50;
    const price_30day = parse.data.price_30day ?? Math.round(price_7day * 3.2 / 100) * 100;

    const supabase = createSupabaseAdmin();
    const defaults = DEFAULTS[category];
    const kmLimits = KM_LIMITS[category];

    // Generate a unique slug
    let name = slugify(display_name);
    const { data: existing } = await supabase.from('bike_models').select('name').like('name', `${name}%`);
    if (existing && existing.length > 0) name = `${name}_${existing.length}`;

    // Create model
    const { data: model, error: modelErr } = await supabase
      .from('bike_models')
      .insert({
        name,
        display_name,
        category,
        cc,
        excess_km_rate: defaults.excess_km_rate,
        late_hourly_penalty: defaults.late_hourly_penalty,
        has_weekend_override: false,
      })
      .select('id, name, display_name, category, cc')
      .single();

    if (modelErr || !model) {
      return NextResponse.json({ error: modelErr?.message ?? 'Failed to create model' }, { status: 500 });
    }

    // Create packages for all 5 tiers
    const prices: Record<string, number> = {
      '12hr': price_12hr,
      '24hr': price_24hr,
      '7day': price_7day,
      '15day': price_15day,
      '30day': price_30day,
    };

    const packages = TIERS.map(tier => ({
      model_id:  model.id,
      tier,
      price:     prices[tier],
      km_limit:  kmLimits[tier],
    }));

    const { error: pkgErr } = await supabase.from('bike_model_packages').insert(packages);
    if (pkgErr) {
      // Roll back the model
      await supabase.from('bike_models').delete().eq('id', model.id);
      return NextResponse.json({ error: pkgErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, model });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
