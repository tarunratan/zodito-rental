import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { verifyPaymentSignature } from '@/lib/razorpay';

export const runtime = 'nodejs';

const schema = z.object({
  extension_id: z.string().uuid(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { extension_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parse.data;

  // 1. Cryptographic verification first — refuse to touch state if the signature is bad.
  if (!verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature })) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // 2. Load the extension and validate ownership / status / order match.
  const { data: ext } = await admin
    .from('booking_extensions')
    .select('id, booking_id, user_id, status, new_end_ts, new_km_limit, extra_km, total_delta, razorpay_order_id, original_end_ts')
    .eq('id', extension_id)
    .eq('booking_id', params.id)
    .maybeSingle();

  if (!ext) return NextResponse.json({ error: 'Extension not found' }, { status: 404 });
  if (ext.user_id !== user.id) return NextResponse.json({ error: 'Not your extension' }, { status: 403 });
  if (ext.status === 'confirmed') {
    // Idempotent: already applied. Return the existing state to the client.
    return NextResponse.json({ ok: true, idempotent: true, new_end_ts: ext.new_end_ts, new_km_limit: ext.new_km_limit });
  }
  if (ext.status !== 'pending_payment') {
    return NextResponse.json({ error: `Extension is ${ext.status}, cannot apply.` }, { status: 400 });
  }
  if (ext.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Order ID does not match this extension.' }, { status: 400 });
  }

  // 3. Re-check that the booking is still in a state where we can extend.
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, end_ts, km_limit, pending_amount, advance_paid')
    .eq('id', ext.booking_id)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: 'Booking gone' }, { status: 404 });
  if (booking.status !== 'ongoing') {
    return NextResponse.json({ error: `Cannot extend a booking with status ${booking.status}` }, { status: 400 });
  }
  if (booking.end_ts !== ext.original_end_ts) {
    // Concurrent extension or admin edit changed the end_ts under us — refuse and let the
    // client re-quote. Marking the extension failed keeps it auditable.
    await admin.from('booking_extensions').update({ status: 'failed' }).eq('id', ext.id);
    return NextResponse.json({ error: 'Booking has changed since you requested the quote. Please try again.' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  // 4. Apply extension atomically (best-effort — two updates; the booking_extensions
  //    row is the audit-of-record so a partial failure is recoverable).
  const { error: extErr } = await admin
    .from('booking_extensions')
    .update({
      status: 'confirmed',
      razorpay_payment_id,
      paid_at: nowIso,
    })
    .eq('id', ext.id);
  if (extErr) {
    console.error('[extension-verify] mark confirmed failed', extErr);
    return NextResponse.json({ error: 'Could not record payment. Contact support.' }, { status: 500 });
  }

  const { error: bookingErr } = await admin
    .from('bookings')
    .update({
      end_ts:        ext.new_end_ts,
      km_limit:      ext.new_km_limit,
      advance_paid:  Number(booking.advance_paid ?? 0) + Number(ext.total_delta),
      updated_at:    nowIso,
    })
    .eq('id', ext.booking_id);

  if (bookingErr) {
    console.error('[extension-verify] booking update failed', bookingErr);
    return NextResponse.json({ error: 'Payment recorded but booking update failed. Support will reconcile.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    new_end_ts: ext.new_end_ts,
    new_km_limit: ext.new_km_limit,
    extra_km: ext.extra_km,
  });
}
