import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { mergeBikePackages } from '@/lib/pricing';
import { isFrozenInWindow } from '@/lib/freeze';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const fromTs = new Date(fromParam);
  const toTs = new Date(toParam);

  if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }
  if (toTs <= fromTs) {
    return NextResponse.json({ error: 'to must be after from' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const fromIso = fromTs.toISOString();
  const toIso = toTs.toISOString();

  // pending_payment bookings expire after 15 minutes — exclude stale ones
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // confirmed bookings free the bike 2 hours after pickup if admin hasn't marked ongoing
  // (no-show / scammer protection — prevents a single bad booking from locking a bike all day)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Three independent reads in parallel:
  // 1. confirmed — time-overlap + start_ts recency (auto-expires 2hrs after unpicked pickup)
  //    pending_payment — time-overlap + created_at recency (expires 15min)
  // 2. ongoing — unconditional: bike is physically out until Mark Return, regardless of end_ts
  // 3. frozen slots — time-overlap check
  const [timeBlockedRes, ongoingRes, frozenRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('bike_id')
      .or(`and(status.eq.confirmed,start_ts.gt.${twoHoursAgo}),and(status.eq.pending_payment,created_at.gt.${fifteenMinAgo})`)
      .lt('start_ts', toIso)
      .gt('end_ts', fromIso),
    supabase
      .from('bookings')
      .select('bike_id')
      .eq('status', 'ongoing'),
    // Frozen-window overlap. `frozen_from` may be NULL (treated as -infinity),
    // so we only REQUIRE `frozen_until` to be set. The `frozen_from < to`
    // half of the overlap is enforced as a logical OR that also accepts NULL.
    supabase
      .from('bikes')
      .select('id')
      .not('frozen_until', 'is', null)
      .gt('frozen_until', fromIso)
      .or(`frozen_from.is.null,frozen_from.lt.${toIso}`),
  ]);

  const unavailableIds = new Set<string>();
  (timeBlockedRes.data ?? []).forEach((r: any) => unavailableIds.add(r.bike_id));
  (ongoingRes.data ?? []).forEach((r: any) => unavailableIds.add(r.bike_id));
  (frozenRes.data ?? []).forEach((r: any) => unavailableIds.add(r.id));

  // ⚠️ This endpoint is THE source of the customer-facing bike list — the
  // homepage's BrowseSection overwrites the SSR list with whatever this
  // endpoint returns on every mount. Anything not merged here is invisible
  // to customers, regardless of what /api/admin/pricing-diag says.
  //
  // We deliberately split into THREE queries (bikes, bike_packages,
  // custom_packages). A single PostgREST relationship-select would couple
  // bike rendering to FK-name detection — if it fails for any reason, the
  // homepage shows zero cards (the symptom users hit).
  // Visibility / freeze columns pulled into the SELECT itself so we can
  // run a post-query SAFETY PASS over the rows the DB returned. If
  // PostgREST / Supabase ever fails to apply the SQL filters (RLS surprise,
  // schema-cache miss, transactional anomaly), the defensive filter below
  // still guarantees inactive / unapproved / frozen bikes do not reach the
  // customer payload.
  let bikesQ = supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
      is_active, listing_status, frozen_from, frozen_until,
      model:bike_models!inner(id, name, display_name, category, cc,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      vendor:vendors(id, business_name, pickup_area)
    `)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  if (unavailableIds.size > 0) {
    bikesQ = bikesQ.not('id', 'in', `(${[...unavailableIds].join(',')})`);
  }

  const bikesRes = await bikesQ;
  if (bikesRes.error) {
    console.error('[api/bikes/available] bikes query failed:', bikesRes.error);
    return NextResponse.json({ error: 'Failed to fetch bikes' }, { status: 500 });
  }
  let bikes = bikesRes.data ?? [];

  // Defense-in-depth: drop ANY row whose visibility flags say it shouldn't
  // be public, even if it made it past the SQL filter. Also drops freeze
  // overlaps as a second layer behind the frozen-ids exclusion above.
  const droppedBySafety: Array<{ id: string; reason: string }> = [];
  bikes = bikes.filter((b: any) => {
    if (b.is_active === false) {
      droppedBySafety.push({ id: b.id, reason: 'is_active=false' });
      return false;
    }
    if (b.listing_status && b.listing_status !== 'approved') {
      droppedBySafety.push({ id: b.id, reason: `listing_status=${b.listing_status}` });
      return false;
    }
    if (isFrozenInWindow(b, fromTs, toTs)) {
      droppedBySafety.push({ id: b.id, reason: 'frozen_overlap' });
      return false;
    }
    return true;
  });
  if (droppedBySafety.length > 0) {
    // Loud warning — this means the SQL filter let something through that
    // shouldn't have escaped. Worth investigating the row + RLS / cache state.
    console.warn('[api/bikes/available] post-query safety pass dropped', droppedBySafety.length, 'bike(s):', droppedBySafety);
  }

  // One log line per request — tells us exactly which bike IDs the home
  // endpoint is exposing, so we can correlate with /bikes/[id] complaints.
  console.log('[api/bikes/available] window:', fromIso, '→', toIso,
    '· unavailable_via_filter:', unavailableIds.size,
    '· post_safety_dropped:', droppedBySafety.length,
    '· returned ids:', bikes.map((b: any) => b.id));

  // Fetch overrides + custom packages for these bikes in parallel.
  const bikeIds = bikes.map((b: any) => b.id);
  let overridesRows: any[] = [];
  let customsRows: any[]   = [];
  if (bikeIds.length > 0) {
    const [overridesRes, customsRes] = await Promise.all([
      supabase
        .from('bike_packages')
        .select('bike_id, tier, price, km_limit')
        .in('bike_id', bikeIds),
      supabase
        .from('custom_packages')
        .select('bike_id, id, label, min_duration_hours, duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active')
        .in('bike_id', bikeIds)
        .eq('is_active', true),
    ]);
    if (overridesRes.error) console.error('[api/bikes/available] bike_packages query failed:', overridesRes.error);
    if (customsRes.error)   console.error('[api/bikes/available] custom_packages query failed:', customsRes.error);
    overridesRows = overridesRes.data ?? [];
    customsRows   = customsRes.data ?? [];
  }

  // Group by bike_id
  const overridesByBike = new Map<string, any[]>();
  for (const o of overridesRows) {
    const arr = overridesByBike.get(o.bike_id) ?? [];
    arr.push({ tier: o.tier, price: o.price, km_limit: o.km_limit });
    overridesByBike.set(o.bike_id, arr);
  }
  const customsByBike = new Map<string, any[]>();
  for (const c of customsRows) {
    const arr = customsByBike.get(c.bike_id) ?? [];
    arr.push(c);
    customsByBike.set(c.bike_id, arr);
  }

  // UNION-merge overrides into each bike's model packages.
  const merged = bikes.map((bike: any) => {
    const overrides = overridesByBike.get(bike.id) ?? [];
    const customs   = customsByBike.get(bike.id)   ?? [];
    const model     = bike.model;
    if (model) {
      model.packages = mergeBikePackages(model.packages ?? [], overrides);
    }
    return { ...bike, model, custom_packages: customs };
  });

  return NextResponse.json(
    { bikes: merged, unavailable_count: unavailableIds.size },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  );
}
