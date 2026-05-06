import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

  // pending_payment expires after 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [bookingRes, bikeRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id')
      .eq('bike_id', bikeId)
      .or(`status.in.(confirmed,ongoing),and(status.eq.pending_payment,created_at.gt.${fifteenMinAgo})`)
      .lt('start_ts', toIso)
      .gt('end_ts', fromIso)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bikes')
      .select('frozen_from, frozen_until')
      .eq('id', bikeId)
      .maybeSingle(),
  ]);

  if (bookingRes.data) {
    return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const bike = bikeRes.data;
  if (bike?.frozen_from && bike?.frozen_until) {
    const ff = new Date(bike.frozen_from);
    const fu = new Date(bike.frozen_until);
    if (ff < toTs && fu > fromTs) {
      return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  return NextResponse.json({ available: true }, { headers: { 'Cache-Control': 'no-store' } });
}
