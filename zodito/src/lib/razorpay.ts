// ============================================================================
// RAZORPAY HELPERS
// ============================================================================
// All Razorpay logic — order creation and signature verification for webhooks.
// Keep this server-only. Never import from a client component.
// ============================================================================

import Razorpay from 'razorpay';
import crypto from 'crypto';

let _instance: Razorpay | null = null;
function rzp(): Razorpay {
  if (!_instance) {
    _instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return _instance;
}

/**
 * Create a Razorpay order for a booking.
 * Amount is in PAISE (smallest unit). ₹100 → 10000.
 */
export async function createRazorpayOrder(params: {
  amountRupees: number;
  bookingId: string;
  bookingNumber: string;
  userId: string;
}) {
  const order = await rzp().orders.create({
    amount: Math.round(params.amountRupees * 100),
    currency: 'INR',
    receipt: params.bookingNumber,
    notes: {
      booking_id: params.bookingId,
      booking_number: params.bookingNumber,
      user_id: params.userId,
    },
  });
  return order;
}

/**
 * Verify a Razorpay payment signature from the frontend success callback.
 * Returns true if signature matches. Use this as a quick client-confirm check,
 * but the AUTHORITATIVE payment status must come from the webhook.
 */
export function verifyPaymentSignature(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): boolean {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex');
  return safeEquals(expected, razorpay_signature);
}

/**
 * Verify a Razorpay WEBHOOK signature (different key, different input).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string
): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');
  return safeEquals(expected, signatureHeader);
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
