/**
 * Home-list endpoint — returns every bike that is currently available for
 * the requested [from, to] window, with merged pricing already attached.
 *
 * Architecture (commit 040):
 *   1. ONE call to the `bike_states` SQL function returns state + merged
 *      packages for every bike in the fleet.
 *   2. JS filters to `available === true` (with a defensive safety pass
 *      that drops any row whose flags say it shouldn't be visible).
 *   3. ONE follow-up SELECT fetches the display fields (emoji, image_url,
 *      model.display_name, vendor) for just the available bike ids.
 *
 * This route used to derive availability inline by joining `bookings`,
 * `bikes`, `bike_packages`, `custom_packages`, and `bike_models` and
 * computing overlap / freeze / merge in JS. That logic now lives entirely
 * inside the SQL function, which the detail page and every other consumer
 * also calls — so the home and the detail page cannot disagree anymore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminFresh } from '@/lib/supabase/server';
import { getBikeStates } from '@/lib/bike-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Belt-and-braces: Next.js 14 caches GET fetches by default, which
// silently pinned step-3's display query to a pre-edit snapshot. The
// fresh admin client below opts each inner fetch out, but explicitly
// disabling fetchCache on the route makes the intent loud at the top
// of the file too.
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }
  const fromTs = new Date(fromParam);
  const toTs   = new Date(toParam);
  if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }
  if (toTs <= fromTs) {
    return NextResponse.json({ error: 'to must be after from' }, { status: 400 });
  }

  // 1) Canonical state lookup for every bike in the fleet.
  let states;
  try {
    states = await getBikeStates(fromTs, toTs);
  } catch (e: any) {
    console.error('[api/bikes/available] bike_states RPC failed:', e?.message ?? e);
    return NextResponse.json({ error: 'Failed to fetch bikes' }, { status: 500 });
  }

  // 2) JS-side defense in depth — should match the SQL but never relies on it.
  const dropped: Array<{ id: string; reason: string }> = [];
  const availableStates = states.filter(s => {
    if (s.is_active === false)                                       { dropped.push({ id: s.bike_id, reason: 'is_active=false' }); return false; }
    if (s.listing_status && s.listing_status !== 'approved')         { dropped.push({ id: s.bike_id, reason: `listing_status=${s.listing_status}` }); return false; }
    return s.available;
  });
  if (dropped.length > 0) {
    console.warn('[api/bikes/available] post-RPC safety pass dropped', dropped.length, 'row(s):', dropped);
  }

  const availableIds = availableStates.map(s => s.bike_id);

  // 3) Display fields + AUTHORITATIVE flags for just the available bikes.
  //
  // We DELIBERATELY re-read `is_active`, `listing_status`, and `frozen_*`
  // directly from the `bikes` table here instead of trusting whatever
  // `bike_states(...)` returned for these columns. Why:
  //
  //   On 2026-05-15 we hit a case where the SQL function returned
  //   is_active=true for a bike whose `bikes` row had is_active=false
  //   (verified via a separate direct SELECT). Cause was a stale
  //   bike_states function body in production — migration 040's CREATE
  //   OR REPLACE didn't take effect on a cached/older definition. The
  //   JS safety filter at step (2) didn't catch it because it tested
  //   `s.is_active === false` and the stale function returned `true`.
  //
  // Lesson: a SQL function's view of a column is not the same as the
  // table's view of it. When they disagree, the TABLE wins. This step
  // is the immovable safety net: even if the function is wrong, a
  // hidden bike cannot make it to the response.
  let displayRows: any[] = [];
  if (availableIds.length > 0) {
    // Fresh client: this query is the immovable safety net described above.
    // The default admin client routes through Next.js's cached fetch, which
    // means a previous response with stale `is_active=true` would pin
    // forever and the safety filter would compare two equally stale values
    // and pass the bike through. The fresh client guarantees the row we
    // read here is the row that's in Postgres right now.
    const supabase = createSupabaseAdminFresh();
    const { data, error } = await supabase
      .from('bikes')
      .select(`
        id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
        is_active, listing_status, is_frozen, frozen_from, frozen_until, freeze_reason,
        model:bike_models!inner(id, name, display_name, category, cc),
        vendor:vendors(id, business_name, pickup_area)
      `)
      .in('id', availableIds)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[api/bikes/available] display query failed:', error);
      return NextResponse.json({ error: 'Failed to fetch bikes' }, { status: 500 });
    }
    displayRows = data ?? [];
  }

  // 4) FINAL safety filter — direct-from-table values are the authority.
  // Anything the function let through that the table contradicts is
  // dropped here. Post-v043 the freeze check is a single boolean — no
  // more date math means no more edge cases.
  const tableSafe = displayRows.filter((row: any) => {
    if (row.is_active !== true) {
      console.warn('[api/bikes/available] FUNCTION/TABLE DISAGREEMENT — dropping', row.id, '(table says is_active =', row.is_active, ')');
      return false;
    }
    if (row.listing_status !== 'approved') {
      console.warn('[api/bikes/available] FUNCTION/TABLE DISAGREEMENT — dropping', row.id, '(table says listing_status =', row.listing_status, ')');
      return false;
    }
    if (row.is_frozen === true) {
      console.warn('[api/bikes/available] FUNCTION/TABLE DISAGREEMENT — dropping', row.id, '(table says is_frozen = true)');
      return false;
    }
    return true;
  });

  // 5) Stitch state + display into the shape BikeCard expects.
  // Flags come from the TABLE (authoritative); packages come from the
  // function (because it does the model+override UNION merge).
  const stateById = new Map(availableStates.map(s => [s.bike_id, s]));
  const merged = tableSafe.map((row: any) => {
    const s = stateById.get(row.id);
    if (!s || !row.model) return null;
    return {
      ...row, // includes is_active / listing_status / frozen_* from the table
      // model.packages carries the SQL-merged tier set.
      model: { ...row.model, packages: s.packages },
      custom_packages: s.custom_packages,
    };
  }).filter(Boolean);

  const tableLayerDropped = displayRows.length - tableSafe.length;
  console.log('[api/bikes/available]',
    'window:', fromTs.toISOString(), '→', toTs.toISOString(),
    '· total_bikes:', states.length,
    '· function_available:', availableStates.length,
    '· js_safety_dropped:', dropped.length,
    '· table_safety_dropped:', tableLayerDropped,
    '· returned ids:', merged.map((b: any) => b.id));

  const unavailableCount = states.length - merged.length;

  return NextResponse.json(
    {
      bikes: merged,
      unavailable_count: unavailableCount,
      // Build marker — bumps with each meaningful change to this route.
      // Hit this endpoint directly in a browser; if you see an older
      // `_route_version` than expected, your production deploy is lagging.
      _route_version: 'bike_states-v4-is_frozen-boolean',
      _state_summary: {
        total_bikes:           states.length,
        function_available:    availableStates.length,
        js_safety_dropped:     dropped.length,
        table_safety_dropped:  tableLayerDropped,
        returned:              merged.length,
      },
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  );
}
