/**
 * Admin-only diagnostic — answers the question:
 *
 *   "I edited 36hr in admin. Why isn't the customer seeing it?"
 *
 * Walks the same data path the customer page uses and reports every layer:
 *
 *   1. Schema  — what tier values does the bike_packages CHECK constraint
 *                actually accept right now in THIS database? (If 36hr / 2day
 *                aren't in here, no admin save will ever land.)
 *   2. Model   — which tiers does bike_model_packages have for this bike's
 *                model? (Historical seed only ships 12hr / 24hr / 7day /
 *                15day / 30day — so anything else MUST come from overrides.)
 *   3. Overrides — what tier rows actually exist in bike_packages for this
 *                bike right now? (If the admin clicked "Save" but a row
 *                doesn't appear here, the INSERT silently failed.)
 *   4. Merged  — the UNION the customer page now sees, post-fix.
 *
 * Hit `/api/admin/pricing-diag/<bike_id>` while signed in as admin to get
 * the JSON dump. Cache-Control: no-store so you can run it repeatedly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { mergeBikePackages } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(_req: NextRequest, { params }: { params: { bikeId: string } }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: NO_STORE });
  }

  const supabase = createSupabaseAdmin();

  // 1) What does the bike_packages CHECK constraint allow right now?
  const { data: checkRows, error: checkErr } = await supabase.rpc('exec_sql_readonly' as any, {
    sql: `SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
           WHERE t.relname = 'bike_packages'
             AND c.contype = 'c'`,
  }).then((r: any) => ({ data: r.data, error: r.error })).catch((e: any) => ({ data: null, error: e }));

  // Fallback if no SQL RPC is available: just describe what the migration intends.
  const acceptedTiers = checkRows
    ? extractTiersFromConstraintDefs(checkRows as any[])
    : null;

  // 2) Model-level packages for this bike
  const { data: bike } = await supabase
    .from('bikes')
    .select('id, registration_number, model:bike_models!inner(id, name, display_name, packages:bike_model_packages(tier, price, km_limit))')
    .eq('id', params.bikeId)
    .maybeSingle();

  if (!bike) {
    return NextResponse.json({ error: 'Bike not found', bike_id: params.bikeId }, { status: 404, headers: NO_STORE });
  }

  const modelPackages = ((bike as any).model?.packages ?? []) as Array<{ tier: string; price: number; km_limit: number }>;

  // 3) Per-bike overrides currently in `bike_packages`
  const { data: overrides } = await supabase
    .from('bike_packages')
    .select('tier, price, km_limit, updated_at')
    .eq('bike_id', params.bikeId);

  // 4) UNION merge (what every consumer should now see)
  const merged = mergeBikePackages(modelPackages as any, (overrides ?? []) as any);

  return NextResponse.json({
    bike_id:       params.bikeId,
    registration:  (bike as any).registration_number,
    model:         { id: (bike as any).model?.id, name: (bike as any).model?.name },

    schema: {
      // What the database is willing to STORE for `bike_packages.tier`.
      // If 36hr / 2day etc. are missing here, admin saves for those tiers
      // will fail at the DB layer — run migration 037 to widen the CHECK.
      accepted_tier_values: acceptedTiers,
      raw_check_constraints: checkRows ?? '(unavailable — exec_sql_readonly RPC not installed; inspect via Supabase Studio)',
      check_query_error: checkErr ? String((checkErr as any)?.message ?? checkErr) : null,
    },

    model_level: {
      tiers: modelPackages.map(p => p.tier),
      rows:  modelPackages,
    },

    overrides: {
      tiers: (overrides ?? []).map((o: any) => o.tier),
      rows:  overrides ?? [],
      note:  (overrides ?? []).length === 0
        ? 'No override rows exist. If you JUST clicked Save in admin, the INSERT failed silently — check the CHECK constraint above and re-save.'
        : 'Override rows present — these should now be reflected to customers.',
    },

    merged: {
      tiers: merged.map(p => p.tier),
      rows:  merged,
      note:  'This is the UNION the customer page now sees post-fix.',
    },
  }, { headers: NO_STORE });
}

function extractTiersFromConstraintDefs(rows: Array<{ def: string }>): string[] | null {
  for (const r of rows) {
    if (!r?.def || !/tier/i.test(r.def)) continue;
    // CHECK ((tier = ANY (ARRAY['12hr'::text, '24hr'::text, ...]))) — pull the quoted tier values.
    const tiers = Array.from(r.def.matchAll(/'([^']+)'/g)).map(m => m[1]);
    if (tiers.length > 0) return tiers;
  }
  return null;
}
