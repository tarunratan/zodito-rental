import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });

  const admin = createSupabaseAdmin();

  const { data: booking } = await admin
    .from('bookings')
    .select('user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.user_id !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('booking_extensions')
    .select('id, status, original_end_ts, new_end_ts, extra_hours, original_km_limit, extra_km, new_km_limit, total_delta, base_delta, gst_delta, matched_tier, razorpay_order_id, razorpay_payment_id, expires_at, created_at, paid_at')
    .eq('booking_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ extensions: data ?? [] });
}
