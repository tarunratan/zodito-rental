import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore } from '@/lib/mock';

export const runtime = 'nodejs';

const bodySchema = z.object({
  booking_id: z.string(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  if (isMockMode()) {
    const idx = mockBookingsStore.findIndex(b => b.id === parse.data.booking_id);
    if (idx >= 0) mockBookingsStore[idx].status = 'cancelled';
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status, razorpay_payment_id, total_amount')
    .eq('id', parse.data.booking_id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Admins can cancel any booking; customers can only cancel their own
  if (user.role !== 'admin' && booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!['pending_payment', 'confirmed'].includes(booking.status)) {
    return NextResponse.json({ error: `Cannot cancel a ${booking.status} booking` }, { status: 400 });
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_reason: parse.data.reason ?? 'cancelled by user',
    })
    .eq('id', booking.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Note: refund is handled manually by admin per your policy.
  // The admin panel will show cancelled bookings with paid status and a "Process refund" action.

  return NextResponse.json({ ok: true });
}
