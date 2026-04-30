'use client';

import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PackageTier } from '@/lib/supabase/types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

type PaymentMethod = 'online' | 'at_pickup';

export function RazorpayCheckout({
  bikeId,
  tier,
  pickupTs,
  extraHelmets,
  mobileHolder,
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
  mobileHolder: boolean;
  couponCode: string | null;
  disabled: boolean;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  setError: (s: string | null) => void;
  totalAmount: number;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Silently capture geolocation on mount — best-effort, never blocks checkout
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => { /* permission denied or unavailable — proceed without */ },
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  async function buildBooking() {
    if (!pickupTs) return null;
    setError(null);
    setSubmitting(true);

    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bike_id: bikeId,
        tier,
        start_ts: pickupTs.toISOString(),
        extra_helmet_count: extraHelmets,
        mobile_holder: mobileHolder,
        payment_method: paymentMethod,
        ...(couponCode ? { coupon_code: couponCode } : {}),
        ...(locationRef.current ? { booking_lat: locationRef.current.lat, booking_lng: locationRef.current.lng } : {}),
      }),
    });

    // Middleware redirected to the sign-in page (HTML) or returned JSON 401 —
    // either way, push to sign-in with the current URL as the return destination.
    if (res.redirected || res.status === 401) {
      setSubmitting(false);
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      router.push(`/sign-in?redirectTo=${returnTo}`);
      return null;
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      setSubmitting(false);
      throw new Error('Server error — please try again.');
    }

    if (!res.ok) throw new Error(data?.error || 'Could not create booking');
    return data;
  }

  async function handleAtPickup() {
    try {
      const data = await buildBooking();
      if (!data) return;
      if (data.mock || data.at_pickup) {
        router.push(`/my-bookings?success=${data.booking_id}`);
      }
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  async function handleOnline() {
    try {
      const data = await buildBooking();
      if (!data) return;

      if (data.mock) {
        router.push(`/my-bookings?success=${data.booking_id}`);
        return;
      }

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

  const totalLabel = `₹${Math.round(totalAmount).toLocaleString('en-IN')}`;

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
        strategy="lazyOnload"
      />

      {/* Payment method selector */}
      <div className="mt-4 grid grid-cols-2 gap-2 p-1 bg-bg rounded-xl border border-border">
        <button
          onClick={() => setPaymentMethod('online')}
          className={cn(
            'py-2 px-3 rounded-lg text-sm font-medium transition-all',
            paymentMethod === 'online'
              ? 'bg-white shadow-sm text-primary'
              : 'text-muted hover:text-primary'
          )}
        >
          🔒 Pay Online
        </button>
        <button
          onClick={() => setPaymentMethod('at_pickup')}
          className={cn(
            'py-2 px-3 rounded-lg text-sm font-medium transition-all',
            paymentMethod === 'at_pickup'
              ? 'bg-white shadow-sm text-primary'
              : 'text-muted hover:text-primary'
          )}
        >
          🏪 Pay at Pickup
        </button>
      </div>

      {paymentMethod === 'at_pickup' && (
        <p className="mt-2 text-[11px] text-muted text-center leading-relaxed">
          Pay the full amount in cash or UPI when you pick up the bike.
        </p>
      )}

      {/* Action button */}
      {paymentMethod === 'online' ? (
        <button
          onClick={handleOnline}
          disabled={disabled || submitting}
          className="btn-accent w-full text-base py-3 mt-3 disabled:bg-border disabled:cursor-not-allowed disabled:text-muted"
        >
          {submitting ? 'Processing…' : disabled ? 'Select pickup time' : `Pay & Confirm · ${totalLabel}`}
        </button>
      ) : (
        <button
          onClick={handleAtPickup}
          disabled={disabled || submitting}
          className="w-full text-base py-3 mt-3 rounded-xl font-semibold border-2 border-accent text-accent hover:bg-accent hover:text-white transition-all disabled:border-border disabled:text-muted disabled:cursor-not-allowed"
        >
          {submitting ? 'Confirming…' : disabled ? 'Select pickup time' : `Confirm Booking · ${totalLabel}`}
        </button>
      )}
    </>
  );
}
