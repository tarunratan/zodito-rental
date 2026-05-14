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
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { getBikeStates } from '@/lib/bike-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // 3) Display fields for just the available bikes — one round trip.
  let displayRows: any[] = [];
  if (availableIds.length > 0) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('bikes')
      .select(`
        id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
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

  // 4) Stitch state + display into the shape BikeCard expects.
  const stateById = new Map(availableStates.map(s => [s.bike_id, s]));
  const merged = displayRows.map((row: any) => {
    const s = stateById.get(row.id);
    if (!s || !row.model) return null;
    return {
      ...row,
      is_active:      s.is_active,
      listing_status: s.listing_status,
      // model.packages now carries the SQL-merged tier set.
      model: { ...row.model, packages: s.packages },
      custom_packages: s.custom_packages,
    };
  }).filter(Boolean);

  console.log('[api/bikes/available]',
    'window:', fromTs.toISOString(), '→', toTs.toISOString(),
    '· total_bikes:', states.length,
    '· available:', availableStates.length,
    '· safety_dropped:', dropped.length,
    '· returned ids:', merged.map((b: any) => b.id));

  const unavailableCount = states.length - availableStates.length;

  return NextResponse.json(
    { bikes: merged, unavailable_count: unavailableCount },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  );
}
