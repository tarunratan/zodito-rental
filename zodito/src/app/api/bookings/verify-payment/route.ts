import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { sendBookingConfirmation } from '@/lib/email';

export const runtime = 'nodejs';

const bodySchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  booking_id: z.string(),
});

export async function POST(req: NextRequest) {
  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const body = parse.data;

  if (isMockMode()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const valid = verifyPaymentSignature({
    razorpay_order_id: body.razorpay_order_id,
    razorpay_payment_id: body.razorpay_payment_id,
    razorpay_signature: body.razorpay_signature,
  });

  const supabase = createSupabaseAdmin();

  if (!valid) {
    await supabase
      .from('bookings')
      .update({ status: 'payment_failed', payment_status: 'failed' })
      .eq('id', body.booking_id);
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
    })
    .eq('id', body.booking_id);

  if (error) {
    console.error('verify-payment update error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Send booking confirmation email (fire-and-forget)
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      booking_number, total_amount, package_tier, start_ts, end_ts,
      user:users(email, first_name, last_name),
      bike:bikes(emoji, model:bike_models(display_name))
    `)
    .eq('id', body.booking_id)
    .maybeSingle();

  if (booking) {
    const user = booking.user as any;
    const bike = booking.bike as any;
    if (user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zoditorentals.com';
      sendBookingConfirmation({
        to: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || '',
        bookingNumber: booking.booking_number,
        bikeName: `${bike?.emoji ?? '🏍️'} ${bike?.model?.display_name ?? 'Bike'}`,
        tier: booking.package_tier,
        startTs: booking.start_ts,
        endTs: booking.end_ts,
        total: Number(booking.total_amount),
        appUrl,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
