/**
 * Diagnostic endpoint — returns the raw `bikes` row for a given id, plus a
 * derived "should it be visible to customers right now?" verdict.
 *
 * WHY THIS EXISTS
 * When a bike "appears on home despite being frozen / hidden", we need to
 * know whether the DB actually reflects the admin's last action. The
 * customer-facing API answers "is it available?" — this endpoint answers
 * the more fundamental "what is the row actually storing?".
 *
 * USAGE
 *   /api/debug/bike-raw?id=<uuid>
 *
 * No auth: returns only the columns relevant to visibility (no PII, no
 * pricing internals). Anyone holding a bike id can read these.
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

  // Fresh client — see helper docstring. Same Next.js fetch-cache hazard
  // applies here even though we filter by id (cache key is the URL).
  const supabase = createSupabaseAdminFresh();
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, is_active, listing_status, is_frozen,
      frozen_from, frozen_until, freeze_reason,
      created_at, updated_at,
      model:bike_models(display_name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found', id }, { status: 404 });
  }

  // Cross-check: ask `bike_states` what it thinks this bike's flags are.
  // If the function's view of `is_active` / `listing_status` differs from
  // the table's, the function body in production is stale — re-run
  // migration 042. Also surface the version marker so we can prove it.
  const fromTs = new Date();
  const toTs = new Date(fromTs.getTime() + 24 * 3600 * 1000);
  const { data: fnRows } = await supabase.rpc('bike_states', {
    p_from:    fromTs.toISOString(),
    p_to:      toTs.toISOString(),
    p_bike_id: id,
  });
  const fnRow = Array.isArray(fnRows) && fnRows.length > 0 ? fnRows[0] : null;
  const { data: versionData } = await supabase.rpc('bike_states_version');
  const version = typeof versionData === 'string' ? versionData : null;

  const now = new Date();
  const row = data as any;
  // Post-v043: visibility is governed by `is_frozen` only. `frozen_until`
  // is metadata. Report both so an admin can see they agree.
  const freezeActiveNow = row.is_frozen === true;

  const functionAgrees = !!fnRow
    && fnRow.is_active === row.is_active
    && fnRow.listing_status === row.listing_status
    && fnRow.is_frozen === row.is_frozen;

  return NextResponse.json(
    {
      bike: data,
      derived: {
        visible_to_customers_now: row.is_active === true
          && row.listing_status === 'approved'
          && row.is_frozen !== true,
        is_active_in_db:      row.is_active,
        listing_status_in_db: row.listing_status,
        is_frozen_in_db:      row.is_frozen,
        freeze_active_now:    freezeActiveNow,
        frozen_from_in_db:    row.frozen_from,
        frozen_until_in_db:   row.frozen_until,
        freeze_reason_in_db:  row.freeze_reason,
        server_now:           now.toISOString(),
      },
      bike_states_function: {
        version_marker: version,           // null if migration 043 hasn't run
        returned_row:   fnRow,             // null if function returned no row
        function_agrees_with_table: functionAgrees,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
