import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { mergeBikePackages } from '@/lib/pricing';

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
    supabase
      .from('bikes')
      .select('id')
      .not('frozen_until', 'is', null)
      .not('frozen_from', 'is', null)
      .lt('frozen_from', toIso)
      .gt('frozen_until', fromIso),
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
  let bikesQ = supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
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
  const bikes = bikesRes.data ?? [];

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
