/**
 * Admin-only diagnostic — answers the question:
 *
 *   "Why does the homepage show 4 bikes available, but when I click 3 of
 *    them I see 'currently offline' or 'already booked'?"
 *
 * Hit `/api/admin/availability-diag?from=<ISO>&to=<ISO>` while signed in
 * as admin. Returns one row per bike in the fleet showing:
 *
 *   - `is_active` / `listing_status` (visibility flags)
 *   - `frozen_now` (freeze check for the requested window)
 *   - `time_blocked` (confirmed / pending_payment overlap)
 *   - `ongoing` (currently rented out)
 *   - `verdict`: what /api/bikes/available WOULD do with this bike
 *                ('show' / 'hidden_inactive' / 'hidden_unapproved' /
 *                 'hidden_booked' / 'hidden_ongoing' / 'hidden_frozen')
 *
 * If a bike that's clearly inactive in the DB still shows `verdict = "show"`,
 * that's a bug in `/api/bikes/available`. If everything else lines up but
 * a customer still sees a stale list, the issue is deployment freshness or
 * the customer's browser HTML cache.
 *
 * Cache-Control: no-store. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isFrozenInWindow } from '@/lib/freeze';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(req: NextRequest) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: NO_STORE }); }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: '?from=<ISO>&to=<ISO> required' }, { status: 400, headers: NO_STORE });
  }
  const fromTs = new Date(fromParam);
  const toTs   = new Date(toParam);
  if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime()) || toTs <= fromTs) {
    return NextResponse.json({ error: 'Invalid date window' }, { status: 400, headers: NO_STORE });
  }
  const fromIso = fromTs.toISOString();
  const toIso   = toTs.toISOString();

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const twoHoursAgo   = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const supabase = createSupabaseAdmin();

  const [bikesRes, timeBlockedRes, ongoingRes] = await Promise.all([
    supabase
      .from('bikes')
      .select('id, registration_number, is_active, listing_status, frozen_from, frozen_until, freeze_reason, model:bike_models!inner(display_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('bike_id, id, status, start_ts, end_ts')
      .or(`and(status.eq.confirmed,start_ts.gt.${twoHoursAgo}),and(status.eq.pending_payment,created_at.gt.${fifteenMinAgo})`)
      .lt('start_ts', toIso)
      .gt('end_ts', fromIso),
    supabase
      .from('bookings')
      .select('bike_id, id, status, start_ts, end_ts')
      .eq('status', 'ongoing'),
  ]);

  if (bikesRes.error) {
    return NextResponse.json({ error: bikesRes.error.message }, { status: 500, headers: NO_STORE });
  }

  const timeBlockedByBike = new Map<string, any>();
  for (const b of (timeBlockedRes.data ?? [])) timeBlockedByBike.set(b.bike_id, b);
  const ongoingByBike = new Map<string, any>();
  for (const b of (ongoingRes.data ?? [])) ongoingByBike.set(b.bike_id, b);

  const rows = (bikesRes.data ?? []).map((bike: any) => {
    const isActive    = bike.is_active === true;
    const isApproved  = bike.listing_status === 'approved';
    const frozenNow   = isFrozenInWindow(bike, fromTs, toTs);
    const timeBlocked = timeBlockedByBike.get(bike.id) ?? null;
    const ongoing     = ongoingByBike.get(bike.id) ?? null;

    let verdict: string;
    if (!isActive)             verdict = 'hidden_inactive';
    else if (!isApproved)      verdict = 'hidden_unapproved';
    else if (ongoing)          verdict = 'hidden_ongoing';
    else if (timeBlocked)      verdict = 'hidden_booked';
    else if (frozenNow)        verdict = 'hidden_frozen';
    else                       verdict = 'show';

    return {
      bike_id:        bike.id,
      registration:   bike.registration_number,
      model_name:     bike.model?.display_name ?? null,
      is_active:      bike.is_active,
      listing_status: bike.listing_status,
      frozen_from:    bike.frozen_from,
      frozen_until:   bike.frozen_until,
      freeze_reason:  bike.freeze_reason,
      frozen_now:     frozenNow,
      time_blocked:   timeBlocked ? { booking_id: timeBlocked.id, status: timeBlocked.status, start_ts: timeBlocked.start_ts, end_ts: timeBlocked.end_ts } : null,
      ongoing:        ongoing     ? { booking_id: ongoing.id }     : null,
      verdict,
    };
  });

  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.verdict] = (summary[r.verdict] ?? 0) + 1;

  return NextResponse.json({
    window: { from: fromIso, to: toIso },
    summary,
    rows,
  }, { headers: NO_STORE });
}
