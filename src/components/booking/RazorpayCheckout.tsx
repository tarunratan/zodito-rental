'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { PackageTier } from '@/lib/supabase/types';

declare global {
  interface Window { Razorpay: any; }
}

type PaymentMethod = 'online' | 'at_pickup';
type CashStatus = 'idle' | 'confirming' | 'confirmed' | 'failed';

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

  // Cash booking optimistic state
  const [cashStatus, setCashStatus] = useState<CashStatus>('idle');
  const [cashError, setCashError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{ id: string; number: string } | null>(null);

  // Silently capture geolocation on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {},
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // ── Cash (Pay at Pickup) ─────────────────────────────────────────────────
  async function handleAtPickup() {
    if (!pickupTs) return;
    setCashStatus('confirming'); // instant visual feedback — UI responds immediately
    setCashError(null);

    try {
      // Get the Supabase session token from local cache — no network, reads localStorage
      const supabase = createSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setCashStatus('failed');
        setCashError('Session expired — please sign in again.');
        return;
      }

      const res = await fetch('/api/bookings/create-cash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bike_id: bikeId,
          tier,
          start_ts: pickupTs.toISOString(),
          extra_helmet_count: extraHelmets,
          mobile_holder: mobileHolder,
          ...(couponCode ? { coupon_code: couponCode } : {}),
          ...(locationRef.current ? { booking_lat: locationRef.current.lat, booking_lng: locationRef.current.lng } : {}),
        }),
      });

      if (res.status === 401) {
        setCashStatus('failed');
        setCashError('Session expired — please sign in again.');
        return;
      }

      let data: any;
      try { data = await res.json(); } catch {
        setCashStatus('failed');
        setCashError('Server error — please try again.');
        return;
      }

      if (!res.ok) {
        setCashStatus('failed');
        setCashError(data?.error ?? 'Could not create booking. Please try again.');
        return;
      }

      setConfirmedBooking({ id: data.booking_id, number: data.booking_number });
      setCashStatus('confirmed');
    } catch {
      setCashStatus('failed');
      setCashError('Network error — please check your connection and try again.');
    }
  }

  // ── Online (Razorpay) ────────────────────────────────────────────────────
  async function buildOnlineBooking() {
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
        payment_method: 'online',
        ...(couponCode ? { coupon_code: couponCode } : {}),
        ...(locationRef.current ? { booking_lat: locationRef.current.lat, booking_lng: locationRef.current.lng } : {}),
      }),
    });

    if (res.redirected || res.status === 401) {
      setSubmitting(false);
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      router.push(`/sign-in?redirectTo=${returnTo}`);
      return null;
    }

    let data: any;
    try { data = await res.json(); } catch {
      setSubmitting(false);
      throw new Error('Server error — please try again.');
    }

    if (!res.ok) throw new Error(data?.error || 'Could not create booking');
    return data;
  }

  async function handleOnline() {
    try {
      const data = await buildOnlineBooking();
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
        modal: { ondismiss: () => setSubmitting(false) },
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

  // ── Cash confirmed state — show inline, no page navigation needed ─────────
  if (cashStatus === 'confirmed' && confirmedBooking) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-green-400 bg-green-50 overflow-hidden">
        <div className="bg-green-400 px-5 py-3 flex items-center gap-2">
          <span className="text-white text-xl">✓</span>
          <span className="text-white font-bold text-base">Booking Confirmed!</span>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-green-200">
            <span className="text-sm text-green-700">Booking Number</span>
            <span className="font-bold text-green-900 font-mono">{confirmedBooking.number}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-green-200">
            <span className="text-sm text-green-700">Payment</span>
            <span className="font-semibold text-green-900">Cash / UPI at pickup</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-green-700">Amount due at pickup</span>
            <span className="font-bold text-green-900">{totalLabel}</span>
          </div>
          <Link
            href={`/my-bookings?success=${confirmedBooking.id}`}
            className="block w-full text-center py-2.5 mt-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            View My Bookings →
          </Link>
        </div>
      </div>
    );
  }

  // ── Cash confirming state ─────────────────────────────────────────────────
  if (cashStatus === 'confirming') {
    return (
      <div className="mt-4 rounded-2xl border-2 border-accent/40 bg-accent/5 p-6 text-center">
        <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-3" />
        <div className="font-semibold text-primary text-base">Confirming your booking…</div>
        <div className="text-sm text-muted mt-1">Usually under a second</div>
      </div>
    );
  }

  // ── Normal state (idle or failed) ─────────────────────────────────────────
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
            paymentMethod === 'online' ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-primary'
          )}
        >
          🔒 Pay Online
        </button>
        <button
          onClick={() => setPaymentMethod('at_pickup')}
          className={cn(
            'py-2 px-3 rounded-lg text-sm font-medium transition-all',
            paymentMethod === 'at_pickup' ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-primary'
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

      {/* Failure error */}
      {cashStatus === 'failed' && cashError && (
        <div className="mt-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
          {cashError}
        </div>
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
          disabled={disabled}
          className="w-full text-base py-3 mt-3 rounded-xl font-semibold border-2 border-accent text-accent hover:bg-accent hover:text-white transition-all disabled:border-border disabled:text-muted disabled:cursor-not-allowed"
        >
          {disabled ? 'Select pickup time' : `Confirm Booking · ${totalLabel}`}
        </button>
      )}
    </>
  );
}
