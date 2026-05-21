import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { findConflictingBooking, PENDING_PAYMENT_TTL_MIN } from '@/lib/booking-overlap';
import { isFrozenInWindow } from '@/lib/freeze';
import { istLocalToUtcIso, formatIstDateTime } from '@/lib/datetime';
import { sendBookingConfirmation } from '@/lib/email';

export const runtime = 'nodejs';

const schema = z.object({
  // ── Core fields ────────────────────────────────────────────────────────────
  bike_id: z.string().uuid(),
  start_ts: z.string(),
  end_ts: z.string(),

  // ── Customer info ──────────────────────────────────────────────────────────
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().min(6, 'Phone number is required'),
  customer_email: z.string().email().optional().or(z.literal('')),
  alternate_phone: z.string().optional().or(z.literal('')),

  // ── Trip details ───────────────────────────────────────────────────────────
  km_limit: z.number().int().min(0).default(0),
  odometer_reading: z.number().int().min(0).optional(),
  package_tier: z.string().optional(),           // e.g. '24hr', '12hr' — label only

  // ── Financials ─────────────────────────────────────────────────────────────
  total_amount: z.number().min(0).default(0),
  advance_paid: z.number().min(0).default(0),
  security_deposit: z.number().min(0).default(0),
  payment_method_detail: z.enum(['cash', 'upi', 'online', 'partial_online']).optional(),
  payment_proof_url: z.string().url().optional().or(z.literal('')),

  // ── Handover checklist ─────────────────────────────────────────────────────
  helmets_provided: z.number().int().min(0).max(5).default(0),
  original_dl_taken: z.boolean().default(false),

  // ── KYC documents (optional — admin may upload at any time) ───────────────
  kyc_dl_front_url:      z.string().optional().or(z.literal('')),
  kyc_dl_back_url:       z.string().optional().or(z.literal('')),
  kyc_aadhaar_front_url: z.string().optional().or(z.literal('')),
  kyc_aadhaar_back_url:  z.string().optional().or(z.literal('')),
  kyc_selfie_url:        z.string().optional().or(z.literal('')),

  // ── Remarks ────────────────────────────────────────────────────────────────
  notes: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.advance_paid > d.total_amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['advance_paid'],
      message: 'Advance paid cannot exceed total amount',
    });
  }
});

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const parse = schema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const {
    bike_id, customer_name, customer_phone, customer_email, alternate_phone,
    start_ts, end_ts,
    total_amount, advance_paid, security_deposit, payment_method_detail, payment_proof_url,
    km_limit, odometer_reading, package_tier,
    helmets_provided, original_dl_taken,
    kyc_dl_front_url, kyc_dl_back_url, kyc_aadhaar_front_url, kyc_aadhaar_back_url, kyc_selfie_url,
    notes,
  } = parse.data;

  // Normalize as IST so a bare datetime-local string never gets mis-stamped
  // as UTC (the admin UI converts already; this is defense in depth).
  const startIso = istLocalToUtcIso(start_ts);
  const endIso   = istLocalToUtcIso(end_ts);
  if (!startIso || !endIso) {
    return NextResponse.json({ error: 'Invalid pickup or drop-off time' }, { status: 400 });
  }
  const startTs = new Date(startIso);
  const endTs   = new Date(endIso);

  if (endTs <= startTs) {
    return NextResponse.json({ error: 'Drop-off must be after pickup' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Parallel: candidate-overlap fetch + bike freeze check — independent reads.
  // We pull ONLY statuses that can possibly block (confirmed/ongoing/pending_payment)
  // — completed, cancelled, payment_failed and no_show never block a future slot.
  // Final status-recency filter is applied in JS via findConflictingBooking()
  // so the canonical rule lives in one place and is unit-tested.
  const [overlapRes, bikeRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, booking_number, status, start_ts, end_ts, created_at')
      .eq('bike_id', bike_id)
      .in('status', ['confirmed', 'ongoing', 'pending_payment'])
      .lt('start_ts', endIso)
      .gt('end_ts', startIso),
    supabase
      .from('bikes')
      .select('id, frozen_from, frozen_until, freeze_reason')
      .eq('id', bike_id)
      .maybeSingle(),
  ]);

  const conflict = findConflictingBooking(startTs, endTs, overlapRes.data ?? [], {
    pendingTtlMin: PENDING_PAYMENT_TTL_MIN,
  });
  if (conflict) {
    console.warn('[manual-booking] slot conflict', {
      bike_id,
      requested: { start: startIso, end: endIso },
      conflicting_booking_id: conflict.id,
      conflicting_booking_number: conflict.booking_number,
      conflicting_status: conflict.status,
      conflicting_range: { start: conflict.start_ts, end: conflict.end_ts },
    });
    return NextResponse.json(
      { error: `Bike already booked (#${conflict.booking_number}) for that period` },
      { status: 409 }
    );
  }

  const bike = bikeRes.data;
  // Canonical freeze check — accepts NULL `frozen_from`.
  if (isFrozenInWindow({ frozen_from: bike?.frozen_from ?? null, frozen_until: bike?.frozen_until ?? null }, startTs, endTs)) {
    return NextResponse.json(
      { error: `Bike is frozen until ${formatIstDateTime(bike!.frozen_until!)}${bike?.freeze_reason ? ': ' + bike.freeze_reason : ''}` },
      { status: 409 }
    );
  }

  // Determine payment status from advance_paid vs total
  const pendingAmount = Math.max(0, total_amount - advance_paid);
  const paymentStatus =
    advance_paid >= total_amount && total_amount > 0 ? 'paid'
    : advance_paid > 0                               ? 'partially_paid'
    : 'pending';

  // Booking number is generated by the `bookings.booking_number` column's
  // DEFAULT expression (sequential ZR### via the booking_number_seq sequence
  // — see migration 046_booking_number_sequence.sql). We don't override it
  // here so manual and online bookings share the same sequence.

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      bike_id,
      customer_name,
      customer_phone,
      start_ts: startIso,
      end_ts: endIso,
      status: 'confirmed',
      payment_status: paymentStatus,
      source: 'manual',
      // booking_number omitted intentionally — DEFAULT generates ZR###.
      notes: notes || null,
      total_amount,
      base_price: total_amount,
      km_limit,
      security_deposit,
      subtotal: total_amount,
      gst_amount: 0,
      coupon_discount: 0,
      extra_helmet_count: helmets_provided,
      extra_helmet_price: 0,
      platform_commission: total_amount,
      vendor_payout: 0,
      package_tier: package_tier ?? '24hr',
      // Extended offline fields
      alternate_phone: alternate_phone || null,
      advance_paid,
      pending_amount: pendingAmount,
      odometer_reading: odometer_reading ?? null,
      helmets_provided,
      original_dl_taken,
      payment_method_detail: payment_method_detail ?? null,
      payment_proof_url: payment_proof_url || null,
      kyc_dl_front_url:      kyc_dl_front_url      || null,
      kyc_dl_back_url:       kyc_dl_back_url       || null,
      kyc_aadhaar_front_url: kyc_aadhaar_front_url || null,
      kyc_aadhaar_back_url:  kyc_aadhaar_back_url  || null,
      kyc_selfie_url:        kyc_selfie_url        || null,
      // Offline bookings are fully admin-entered at creation: stamp them as
      // saved immediately so reopening shows the Order Confirmation view
      // rather than the editable form again.
      handover_saved_at: new Date().toISOString(),
      handover_saved_by: admin.id,
    })
    .select('id, booking_number')
    .single();

  if (error) {
    console.error('Manual booking error:', error);
    return NextResponse.json({ error: 'Failed to create booking: ' + error.message }, { status: 500 });
  }

  // Confirmation email — only when admin captured an email for the customer.
  // Fire-and-forget; node runtime keeps the promise alive after the response.
  if (customer_email) {
    void (async () => {
      try {
        const { data: bikeRow } = await supabase
          .from('bikes')
          .select(`
            registration_number, color, extra_km_rate, late_penalty_hour,
            model:bike_models!inner(display_name, cc, excess_km_rate, late_hourly_penalty)
          `)
          .eq('id', bike_id)
          .maybeSingle();
        const m = (bikeRow as any)?.model;
        const bikeDetails = [bikeRow?.registration_number, bikeRow?.color, m?.cc ? `${m.cc}cc` : null].filter(Boolean).join(' · ');
        await sendBookingConfirmation(customer_email, {
          name: customer_name.split(' ')[0] || 'there',
          bookingNumber: booking.booking_number,
          bike: m?.display_name ?? 'Bike',
          bikeDetails: bikeDetails || undefined,
          startDate: formatIstDateTime(startIso),
          endDate: formatIstDateTime(endIso),
          kmLimit: km_limit,
          total: total_amount,
          advancePaid: advance_paid,
          pending: pendingAmount,
          securityDeposit: security_deposit,
          pickupLocation: 'Zodito KPHB Store, 436 Sri Sai Vamshi Residency, Gokul Plots, Kukatpally, Hyderabad – 500085',
          pickupPhone: '+91 93929 12953',
          extraKmRate: (bikeRow as any)?.extra_km_rate ?? m?.excess_km_rate,
          latePenaltyRate: (bikeRow as any)?.late_penalty_hour ?? m?.late_hourly_penalty,
        });
      } catch (e) {
        console.error('[manual-booking] confirmation email failed', e);
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    booking_id: booking.id,
    booking_number: booking.booking_number,
    pending_amount: pendingAmount,
  });
}
