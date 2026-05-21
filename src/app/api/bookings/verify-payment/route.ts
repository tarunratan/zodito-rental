import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { sendBookingConfirmation } from '@/lib/email';
import { formatIstDateTime } from '@/lib/datetime';

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

  // Fire-and-forget confirmation email. Failures are swallowed inside `send()`
  // so a Resend outage never blocks the booking flow.
  void (async () => {
    try {
      const { data: full } = await supabase
        .from('bookings')
        .select(`
          booking_number, start_ts, end_ts, km_limit, total_amount, advance_paid, pending_amount, security_deposit,
          user:users!inner(email, first_name, last_name),
          bike:bikes!inner(
            registration_number, color, extra_km_rate, late_penalty_hour,
            owner_type,
            model:bike_models!inner(display_name, cc, excess_km_rate, late_hourly_penalty),
            vendor:vendors(business_name, pickup_address, pickup_area, contact_phone)
          )
        `)
        .eq('id', body.booking_id)
        .maybeSingle();
      if (!full) return;
      const u = (full as any).user;
      if (!u?.email) return;
      const bk = (full as any).bike;
      const bikeDetails = [bk?.registration_number, bk?.color, bk?.model?.cc ? `${bk.model.cc}cc` : null].filter(Boolean).join(' · ');
      const pickup = bk?.owner_type === 'vendor'
        ? [bk?.vendor?.business_name, bk?.vendor?.pickup_address ?? bk?.vendor?.pickup_area].filter(Boolean).join(' — ')
        : 'Zodito KPHB Store, 436 Sri Sai Vamshi Residency, Gokul Plots, Kukatpally, Hyderabad – 500085';
      const phone = bk?.owner_type === 'vendor' ? bk?.vendor?.contact_phone : '+91 93929 12953';
      await sendBookingConfirmation(u.email, {
        name: u.first_name || 'there',
        bookingNumber: full.booking_number,
        bike: bk?.model?.display_name ?? 'Bike',
        bikeDetails: bikeDetails || undefined,
        startDate: formatIstDateTime(full.start_ts),
        endDate: formatIstDateTime(full.end_ts),
        kmLimit: full.km_limit,
        total: full.total_amount,
        advancePaid: full.advance_paid,
        pending: full.pending_amount,
        securityDeposit: full.security_deposit,
        pickupLocation: pickup || undefined,
        pickupPhone: phone || undefined,
        extraKmRate: bk?.extra_km_rate ?? bk?.model?.excess_km_rate,
        latePenaltyRate: bk?.late_penalty_hour ?? bk?.model?.late_hourly_penalty,
      });
    } catch (e) {
      console.error('[verify-payment] confirmation email failed', e);
    }
  })();

  return NextResponse.json({
    ok: true,
    is_partial: isPartial ?? false,
    pending_amount: isPartial ? booking?.pending_amount : 0,
  });
}
