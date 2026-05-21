/**
 * Admin "settlement" endpoint — used to extend an overdue booking at a
 * NEGOTIATED amount rather than the auto-computed late penalty (which in
 * practice nobody pays — ₹49/hr × 87hr = ₹4,263 doesn't get collected).
 *
 * The operator types in the amount they actually expect from the customer
 * (per-day rate calculation, hourly snapshot, or a flat number) plus the
 * new drop-off date. This route persists that as a pre-quoted row in
 * `booking_extensions`, creates a Razorpay order for the exact amount,
 * and returns a deep link the operator can paste into WhatsApp.
 *
 * The customer-side flow at /my-bookings/[id]?ext=<extension_id> picks up
 * the pre-created extension and offers a one-tap Razorpay payment for that
 * exact amount. The verify endpoint already handles extension → booking
 * application without any changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/razorpay';
import { isWithinStoreHours } from '@/lib/pricing';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000), // ₹10L cap is plenty for any single settlement
  new_end_ts: z.string(),                       // ISO or YYYY-MM-DDTHH:mm — caller normalises
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const parse = schema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { booking_id, amount, new_end_ts, note } = parse.data;

  const newEndTs = new Date(new_end_ts);
  if (isNaN(newEndTs.getTime())) {
    return NextResponse.json({ error: 'Invalid new_end_ts' }, { status: 400 });
  }
  // Same store-window check the customer flow uses — keeps the audit story
  // consistent across surfaces.
  if (!isWithinStoreHours(newEndTs)) {
    return NextResponse.json({ error: 'Drop-offs accepted only between 6 AM and 10:30 PM IST' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_number, user_id, status, end_ts, km_limit')
    .eq('id', booking_id)
    .maybeSingle();

  if (!booking)                          return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.status !== 'ongoing')      return NextResponse.json({ error: `Cannot settle a booking with status ${booking.status}` }, { status: 400 });
  if (newEndTs <= new Date(booking.end_ts)) {
    return NextResponse.json({ error: 'New drop-off must be after the current drop-off' }, { status: 400 });
  }

  const extraHours = (newEndTs.getTime() - new Date(booking.end_ts).getTime()) / 3_600_000;

  // Mark any older pending admin/customer extensions as expired so the
  // customer doesn't end up paying the stale Razorpay order. Cheap query —
  // the index on (status, expires_at) covers it.
  await supabase
    .from('booking_extensions')
    .update({ status: 'expired' })
    .eq('booking_id', booking_id)
    .eq('status', 'pending_payment');

  // Long expiry so the operator has time to relay the link via WhatsApp and
  // the customer has time to tap and pay. 24h matches what most real-world
  // payment links use.
  const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();

  const { data: extension, error: insertErr } = await supabase
    .from('booking_extensions')
    .insert({
      booking_id:         booking.id,
      user_id:            booking.user_id,
      status:             'pending_payment',
      original_end_ts:    booking.end_ts,
      new_end_ts:         newEndTs.toISOString(),
      extra_hours:        Number(extraHours.toFixed(2)),
      original_km_limit:  booking.km_limit ?? 0,
      extra_km:           0,                          // KM unchanged for negotiated settlements; admin can edit booking row directly if needed
      new_km_limit:       booking.km_limit ?? 0,
      base_delta:         amount,                     // Admin-set amount lives in base_delta so verify->advance_paid math stays correct
      gst_delta:          0,
      total_delta:        amount,
      matched_tier:       null,                       // No tier — this is a custom settlement
      custom_package_id:  null,
      expires_at:         expiresAt,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[admin-settlement] insert failed', insertErr);
    return NextResponse.json({ error: 'Could not create settlement: ' + insertErr.message }, { status: 500 });
  }

  // Razorpay order — caller can hand off the order_id to the customer-side
  // panel which mounts Razorpay against this exact order.
  try {
    const order = await createRazorpayOrder({
      amountRupees: amount,
      bookingId:    booking.id,
      bookingNumber: booking.booking_number,
      userId:       booking.user_id,
    });
    await supabase
      .from('booking_extensions')
      .update({ razorpay_order_id: order.id })
      .eq('id', extension.id);

    return NextResponse.json({
      ok: true,
      extension_id: extension.id,
      razorpay_order_id: order.id,
      amount,
      new_end_ts: newEndTs.toISOString(),
      expires_at: expiresAt,
      booking_number: booking.booking_number,
      note: note ?? null,
    });
  } catch (e: any) {
    await supabase.from('booking_extensions').update({ status: 'failed' }).eq('id', extension.id);
    console.error('[admin-settlement] razorpay order failed', e);
    return NextResponse.json({ error: 'Payment gateway error. Please try again.' }, { status: 500 });
  }
}
