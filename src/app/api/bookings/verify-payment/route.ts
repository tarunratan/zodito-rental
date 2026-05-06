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

  // Fetch booking to determine partial vs full payment (advance_paid set at creation for partial)
  const { data: booking } = await supabase
    .from('bookings')
    .select('total_amount, advance_paid, pending_amount')
    .eq('id', body.booking_id)
    .single();

  // Partial: advance_paid > 0 and pending_amount > 0 (set at creation)
  const isPartial = booking && booking.advance_paid > 0 && booking.pending_amount > 0;

  const update: Record<string, unknown> = {
    status: 'confirmed',
    payment_status: isPartial ? 'partially_paid' : 'paid',
    razorpay_payment_id: body.razorpay_payment_id,
    razorpay_signature: body.razorpay_signature,
  };

  // For full payment: mark the entire amount as received
  if (!isPartial && booking) {
    update.advance_paid    = booking.total_amount;
    update.pending_amount  = 0;
  }

  const { error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', body.booking_id);

  if (error) {
    console.error('verify-payment update error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    is_partial: isPartial ?? false,
    pending_amount: isPartial ? booking?.pending_amount : 0,
  });
}
