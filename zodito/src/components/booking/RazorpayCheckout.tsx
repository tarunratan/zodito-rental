'use client';

import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useState } from 'react';
import type { PackageTier } from '@/lib/supabase/types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function RazorpayCheckout({
  bikeId,
  tier,
  pickupTs,
  extraHelmets,
  couponCode,
  disabled,
  submitting,
  setSubmitting,
  setError,
  totalAmount,
}: {
  bikeId: string;
  tier: PackageTier;
  pickupTs: Date | null;
  extraHelmets: number;
  couponCode: string | null;
  disabled: boolean;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  setError: (s: string | null) => void;
  totalAmount: number;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);

  async function handleCheckout() {
    if (!pickupTs) return;
    setError(null);
    setSubmitting(true);

    try {
      // 1. Create booking + Razorpay order on the server
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bike_id: bikeId,
          tier,
          start_ts: pickupTs.toISOString(),
          extra_helmet_count: extraHelmets,
          ...(couponCode ? { coupon_code: couponCode } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'kyc_required') {
          router.push('/kyc');
          return;
        }
        throw new Error(data.error || 'Could not create booking');
      }

      // MOCK MODE: server returns { mock: true } and we just go to the bookings page
      if (data.mock) {
        router.push(`/my-bookings?success=${data.booking_id}`);
        return;
      }

      // 2. Open Razorpay checkout
      if (typeof window.Razorpay === 'undefined') {
        throw new Error('Payment gateway not loaded yet. Please try again.');
      }

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        order_id: data.razorpay.order_id,
        name: 'Zodito Rentals',
        description: `Booking ${data.booking_number}`,
        prefill: data.prefill,
        theme: { color: '#f97316' },
        handler: async (resp: any) => {
          // Verify payment on server; server also awaits webhook for final confirmation
          await fetch('/api/bookings/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              booking_id: data.booking_id,
            }),
          });
          router.push(`/my-bookings?success=${data.booking_id}`);
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });

      rzp.on('payment.failed', (resp: any) => {
        setError(resp.error?.description || 'Payment failed. Please try again.');
        setSubmitting(false);
      });

      rzp.open();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
        strategy="lazyOnload"
      />
      <button
        onClick={handleCheckout}
        disabled={disabled || submitting}
        className="btn-accent w-full text-base py-3 mt-4 disabled:bg-border disabled:cursor-not-allowed disabled:text-muted"
      >
        {submitting ? 'Processing…' : disabled ? 'Select pickup time' : `Pay & confirm · ₹${Math.round(totalAmount).toLocaleString('en-IN')}`}
      </button>
    </>
  );
}
