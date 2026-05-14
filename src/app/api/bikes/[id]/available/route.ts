import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isFrozenInWindow } from '@/lib/freeze';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const fromTs = new Date(fromParam);
  const toTs   = new Date(toParam);

  if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime()) || toTs <= fromTs) {
    return NextResponse.json({ available: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase  = createSupabaseAdmin();
  const fromIso   = fromTs.toISOString();
  const toIso     = toTs.toISOString();
  const bikeId    = params.id;

  // pending_payment expires after 15 minutes; confirmed expires 2hrs after unpicked pickup
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const twoHoursAgo   = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  // Grace window for overdue `ongoing` rides — see the long-form comment in
  // /api/bikes/available/route.ts. Beyond this we no longer treat an
  // un-returned bike as physically out for future searches.
  const ONGOING_GRACE_DAYS = 2;
  const fromMinusGraceIso  = new Date(fromTs.getTime() - ONGOING_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [timeBlockedRes, ongoingRes, bikeRes] = await Promise.all([
    // confirmed + pending_payment — only block during time window (with recency guard)
    supabase
      .from('bookings')
      .select('id')
      .eq('bike_id', bikeId)
      .or(`and(status.eq.confirmed,start_ts.gt.${twoHoursAgo}),and(status.eq.pending_payment,created_at.gt.${fifteenMinAgo})`)
      .lt('start_ts', toIso)
      .gt('end_ts', fromIso)
      .limit(1)
      .maybeSingle(),
    // ongoing — block ONLY when the booking's scheduled end_ts (plus grace
    // period for overdue) overlaps the search window. Was unconditional.
    supabase
      .from('bookings')
      .select('id')
      .eq('bike_id', bikeId)
      .eq('status', 'ongoing')
      .gt('end_ts', fromMinusGraceIso)
      .limit(1)
      .maybeSingle(),
    // Visibility flags fetched in the SAME query as freeze metadata — this is
    // the bike's row of record. Without these, the home list endpoint and
    // the detail endpoint could disagree on whether the bike was available
    // (the user reported clicking through a "4 available" card and getting
    // "currently offline").
    supabase
      .from('bikes')
      .select('id, is_active, listing_status, frozen_from, frozen_until')
      .eq('id', bikeId)
      .maybeSingle(),
  ]);

  const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  if (!bikeRes.data) {
    return NextResponse.json({ available: false, reason: 'not_found' }, { headers: NO_STORE });
  }
  if (bikeRes.data.is_active === false) {
    return NextResponse.json({ available: false, reason: 'inactive' }, { headers: NO_STORE });
  }
  if (bikeRes.data.listing_status && bikeRes.data.listing_status !== 'approved') {
    return NextResponse.json({ available: false, reason: 'unapproved' }, { headers: NO_STORE });
  }
  if (ongoingRes.data)     return NextResponse.json({ available: false, reason: 'ongoing' },          { headers: NO_STORE });
  if (timeBlockedRes.data) return NextResponse.json({ available: false, reason: 'booked' },           { headers: NO_STORE });
  if (isFrozenInWindow(bikeRes.data, fromTs, toTs)) {
    return NextResponse.json(
      { available: false, reason: 'frozen', frozen_until: bikeRes.data.frozen_until },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({ available: true }, { headers: NO_STORE });
}
