interface ConfirmedPartial {
  id: string;
  number: string;
  pendingAmount?: number;
}

interface OpenRazorpayArgs {
  data: any;
  onPartialConfirmed: (info: ConfirmedPartial) => void;
  onFullSuccess: (bookingId: string) => void;
  onError: (msg: string) => void;
  onDismiss: () => void;
}

export function openRazorpay({
  data,
  onPartialConfirmed,
  onFullSuccess,
  onError,
  onDismiss,
}: OpenRazorpayArgs) {
  if (typeof window.Razorpay === 'undefined') {
    throw new Error('Payment gateway not loaded yet. Please try again.');
  }

  const rzp = new window.Razorpay({
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    amount: data.razorpay.amount,
    currency: data.razorpay.currency,
    order_id: data.razorpay.order_id,
    name: 'Zodito Rentals',
    description: data.is_partial
      ? `Advance (20%) for Booking ${data.booking_number}`
      : `Booking ${data.booking_number}`,
    prefill: data.prefill,
    theme: { color: '#f97316' },
    handler: async (resp: any) => {
      const verifyRes = await fetch('/api/bookings/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
          booking_id: data.booking_id,
        }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (data.is_partial) {
        onPartialConfirmed({
          id: data.booking_id,
          number: data.booking_number,
          pendingAmount: verifyData.pending_amount ?? data.pending_amount,
        });
      } else {
        onFullSuccess(data.booking_id);
      }
    },
    modal: { ondismiss: onDismiss },
  });

  rzp.on('payment.failed', (resp: any) => {
    onError(resp.error?.description || 'Payment failed. Please try again.');
  });

  rzp.open();
}
