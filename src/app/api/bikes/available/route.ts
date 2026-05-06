import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

  // Parallel: bookings overlap + freeze overlap — independent reads
  const [bookedRes, frozenRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('bike_id')
      .or(`status.in.(confirmed,ongoing),and(status.eq.pending_payment,created_at.gt.${fifteenMinAgo})`)
      .lt('start_ts', toIso)
      .gt('end_ts', fromIso),
    supabase
      .from('bikes')
      .select('id')
      .not('frozen_until', 'is', null)
      .not('frozen_from', 'is', null)
      .lt('frozen_from', toIso)
      .gt('frozen_until', fromIso),
  ]);

  const unavailableIds = new Set<string>();
  (bookedRes.data ?? []).forEach((r: any) => unavailableIds.add(r.bike_id));
  (frozenRes.data ?? []).forEach((r: any) => unavailableIds.add(r.id));

  let query = supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
      model:bike_models!inner(id, name, display_name, category, cc,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      vendor:vendors(id, business_name, pickup_area),
      custom_packages(id, label, min_duration_hours, duration_hours, price, km_limit, is_active)
    `)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  if (unavailableIds.size > 0) {
    query = query.not('id', 'in', `(${[...unavailableIds].join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Available bikes error:', error);
    return NextResponse.json({ error: 'Failed to fetch bikes' }, { status: 500 });
  }

  return NextResponse.json(
    { bikes: data ?? [], unavailable_count: unavailableIds.size },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
