/**
 * Diagnostic endpoint — returns every pricing input that contributes to a
 * single bike's display price, plus the merged result and which row "won"
 * the displayed "from ₹X" number on the home card.
 *
 *   GET /api/debug/bike-pricing?id=<uuid>
 *
 * What this surfaces (in priority order, override beats default):
 *   • model_defaults  — bike_model_packages rows for the bike's model.
 *                       These are the prices a bike inherits unless overridden.
 *   • bike_overrides  — bike_packages rows for this specific bike. Each row
 *                       here shadows the same-tier model default.
 *   • custom_packages — custom_packages rows (label + price + duration).
 *                       Active ones compete with standard tiers for the
 *                       "from ₹X" minimum.
 *   • merged_packages — the UNION (overrides ∪ defaults_not_overridden),
 *                       same shape that bike_states(...) returns.
 *   • display.from_price + display.from_source — the single row currently
 *                       being shown as "Starts at ₹X" on the home card.
 *
 * The point: when admin says "I configured ₹400 for 12hr but the card shows
 * ₹450", this endpoint shows exactly which row is winning and from which
 * table — model default? override? custom? — so the misconfiguration can
 * be fixed in one click instead of a Supabase dashboard archaeology dig.
 *
 * No auth: read-only and contains no PII.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminFresh } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdminFresh();

  const { data: bikeRow, error: bikeErr } = await supabase
    .from('bikes')
    .select('id, model_id, model:bike_models(id, display_name)')
    .eq('id', id)
    .maybeSingle();

  if (bikeErr) {
    return NextResponse.json({ error: bikeErr.message }, { status: 500 });
  }
  if (!bikeRow) {
    return NextResponse.json({ error: 'not_found', id }, { status: 404 });
  }

  const modelId = (bikeRow as any).model_id;

  const [modelDefaults, bikeOverrides, customPackages] = await Promise.all([
    supabase
      .from('bike_model_packages')
      .select('tier, price, km_limit')
      .eq('model_id', modelId)
      .order('tier'),
    supabase
      .from('bike_packages')
      .select('tier, price, km_limit, created_at, updated_at')
      .eq('bike_id', id)
      .order('tier'),
    supabase
      .from('custom_packages')
      .select('id, label, duration_hours, min_duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active, created_at, updated_at')
      .eq('bike_id', id)
      .order('min_duration_hours'),
  ]);

  // Build the merged set the same way migration 040's bike_states function
  // does — overrides win, model defaults fill the gaps. We compute it in JS
  // here (rather than reading bike_states) so the debug payload shows the
  // intent of the join, not the function's stored output.
  const overrideByTier: Record<string, any> = {};
  for (const p of (bikeOverrides.data ?? [])) {
    overrideByTier[(p as any).tier] = p;
  }
  const merged = [
    ...(bikeOverrides.data ?? []).map((p: any) => ({
      tier:      p.tier,
      price:     Number(p.price),
      km_limit:  p.km_limit,
      source:    'bike_override',
      overrides_model_default: !!(modelDefaults.data ?? []).find((m: any) => m.tier === p.tier),
    })),
    ...(modelDefaults.data ?? [])
      .filter((p: any) => !overrideByTier[p.tier])
      .map((p: any) => ({
        tier:     p.tier,
        price:    Number(p.price),
        km_limit: p.km_limit,
        source:   'model_default',
        overrides_model_default: false,
      })),
  ];

  // Compute the "Starts at ₹X" number the home card would render right now
  // (matches BikeCard.tsx — min across all merged standard + active custom).
  const activeCustoms = (customPackages.data ?? []).filter((p: any) => p.is_active);
  const candidatePrices = [
    ...merged.map(p => ({ kind: 'standard', tier: p.tier, source: p.source, price: p.price, label: null as string | null })),
    ...activeCustoms.map((p: any) => ({ kind: 'custom', tier: null, source: 'custom_packages', price: Number(p.price), label: p.label })),
  ].filter(p => p.price > 0);

  candidatePrices.sort((a, b) => a.price - b.price);
  const fromRow = candidatePrices[0] ?? null;

  // The 24hr sidecar shown on the card — separately surfaced so admin can
  // confirm "yes ₹X is what's at the top-right".
  const pkg24 = merged.find(p => p.tier === '24hr') ?? null;

  return NextResponse.json(
    {
      bike: {
        id: bikeRow.id,
        model_id: modelId,
        model_name: (bikeRow as any).model?.display_name ?? null,
      },
      model_defaults: (modelDefaults.data ?? []).map((p: any) => ({
        tier: p.tier, price: Number(p.price), km_limit: p.km_limit,
      })),
      bike_overrides: (bikeOverrides.data ?? []).map((p: any) => ({
        tier: p.tier, price: Number(p.price), km_limit: p.km_limit,
        updated_at: p.updated_at,
      })),
      custom_packages: (customPackages.data ?? []).map((p: any) => ({
        id: p.id, label: p.label,
        duration_hours: p.duration_hours,
        min_duration_hours: p.min_duration_hours,
        price: Number(p.price), km_limit: p.km_limit,
        per_day_price: p.per_day_price, per_day_km_limit: p.per_day_km_limit,
        is_active: p.is_active,
        updated_at: p.updated_at,
      })),
      merged_packages: merged,
      display: {
        from_price: fromRow?.price ?? null,
        from_source: fromRow,           // { kind, tier|label, source, price }
        pkg_24hr:    pkg24,             // null if no 24hr tier configured
        candidate_count: candidatePrices.length,
      },
      fetched_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
