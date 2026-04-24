import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook — the authoritative source for payment status.
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL: https://yourdomain.com/api/webhooks/razorpay
 *   Events: payment.captured, payment.failed, order.paid, refund.processed
 *
 * Idempotency: Razorpay may retry webhooks. We dedupe via webhook_events table.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const eventId = event.event_id || event.id || signature;

  const supabase = createSupabaseAdmin();

  // Idempotency: skip if already processed
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, processed_at')
    .eq('source', 'razorpay')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing?.processed_at) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Log the event
  await supabase.from('webhook_events').upsert(
    {
      source: 'razorpay',
      event_id: eventId,
      event_type: event.event,
      payload: event,
    },
    { onConflict: 'source,event_id' }
  );

  try {
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload.payment?.entity;
        const orderId = payment?.order_id;
        if (!orderId) break;

        await supabase
          .from('bookings')
          .update({
            status: 'confirmed',
            payment_status: 'paid',
            razorpay_payment_id: payment.id,
          })
          .eq('razorpay_order_id', orderId)
          .in('status', ['pending_payment', 'payment_failed']);
        break;
      }

      case 'payment.failed': {
        const payment = event.payload.payment?.entity;
        const orderId = payment?.order_id;
        if (!orderId) break;

        await supabase
          .from('bookings')
          .update({
            status: 'payment_failed',
            payment_status: 'failed',
          })
          .eq('razorpay_order_id', orderId)
          .eq('status', 'pending_payment');
        break;
      }

      case 'refund.processed': {
        const refund = event.payload.refund?.entity;
        const paymentId = refund?.payment_id;
        if (!paymentId) break;

        await supabase
          .from('bookings')
          .update({ payment_status: 'refunded' })
          .eq('razorpay_payment_id', paymentId);
        break;
      }
    }

    await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('source', 'razorpay')
      .eq('event_id', eventId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    await supabase
      .from('webhook_events')
      .update({ error: err.message })
      .eq('source', 'razorpay')
      .eq('event_id', eventId);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
