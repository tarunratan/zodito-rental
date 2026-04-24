import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

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

  // Verify signature. If this fails, the webhook will never confirm it either,
  // so we mark the booking as failed right here.
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

  // Mark booking confirmed. The webhook is the authoritative source and will
  // overwrite this if anything changes, but for UX we flip immediately so the
  // user sees "Confirmed" right away.
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

  return NextResponse.json({ ok: true });
}
