'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { PackageTier } from '@/lib/supabase/types';

declare global {
  interface Window { Razorpay: any; }
}

type PaymentMethod = 'online' | 'partial_online' | 'at_pickup';
type CashStatus   = 'idle' | 'confirming' | 'confirmed' | 'failed';
type LocStatus    = 'pending' | 'granted' | 'denied' | 'timeout';

export function RazorpayCheckout({
  bikeId,
  tier,
  customPackageId,
  actualDays,
  pickupTs,
  extraHelmets,
  mobileHolder,
  couponCode,
  disabled,
  submitting,
  setSubmitting,
  setError,
  totalAmount,
  securityDeposit,
}: {
  bikeId: string;
  tier: PackageTier;
  customPackageId?: string;
  actualDays?: number;
  pickupTs: Date | null;
  extraHelmets: number;
  mobileHolder: boolean;
  couponCode: string | null;
  disabled: boolean;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  setError: (s: string | null) => void;
  totalAmount: number;
  securityDeposit: number;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>('pending');

  const [cashStatus, setCashStatus]             = useState<CashStatus>('idle');
  const [cashError, setCashError]               = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{ id: string; number: string; pendingAmount?: number } | null>(null);

  // Minimum advance for partial payment: 20% rounded up
  const partialAdvance  = Math.ceil(totalAmount * 0.20);
  const partialPending  = totalAmount - partialAdvance;

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('timeout');
      return;
    }
    setLocStatus('pending');
    navigator.geolocation.getCurrentPosition(
      pos => {
        locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocStatus('granted');
      },
      err => {
        setLocStatus(err.code === 1 ? 'denied' : 'timeout');
      },
      { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  // ── Cash (Pay at Pickup) ──────────────────────────────────────────────────
  async function handleAtPickup() {
    if (!pickupTs || !locationRef.current) return;
    setCashStatus('confirming');
    setCashError(null);

    try {
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
          ...(customPackageId ? { custom_package_id: customPackageId } : { tier }),
          ...(actualDays ? { actual_days: actualDays } : {}),
          start_ts: pickupTs.toISOString(),
          extra_helmet_count: extraHelmets,
          mobile_holder: mobileHolder,
          booking_lat: locationRef.current.lat,
          booking_lng: locationRef.current.lng,
          ...(couponCode ? { coupon_code: couponCode } : {}),
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
        if (res.status === 409) {
          setCashError('This time slot is no longer available. Please select a different pickup time.');
        } else {
          setCashError(data?.error ?? 'Could not create booking. Please try again.');
        }
        return;
      }

      setConfirmedBooking({ id: data.booking_id, number: data.booking_number });
      setCashStatus('confirmed');
    } catch {
      setCashStatus('failed');
      setCashError('Network error — please check your connection and try again.');
    }
  }

  // ── Online (full or partial via Razorpay) ─────────────────────────────────
  async function buildOnlineBooking(paymentType: 'full' | 'partial') {
    if (!pickupTs || !locationRef.current) return null;
    setError(null);
    setSubmitting(true);

    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bike_id: bikeId,
        ...(customPackageId ? { custom_package_id: customPackageId } : { tier }),
        ...(actualDays ? { actual_days: actualDays } : {}),
        start_ts: pickupTs.toISOString(),
        extra_helmet_count: extraHelmets,
        mobile_holder: mobileHolder,
        payment_method: 'online',
        payment_type: paymentType,
        booking_lat: locationRef.current.lat,
        booking_lng: locationRef.current.lng,
        ...(couponCode ? { coupon_code: couponCode } : {}),
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

    if (!res.ok) {
      const msg = res.status === 409
        ? 'This time slot is no longer available. Please select a different pickup time.'
        : (data?.error || 'Could not create booking');
      throw new Error(msg);
    }
    return data;
  }

  async function handleOnline(paymentType: 'full' | 'partial' = 'full') {
    try {
      const data = await buildOnlineBooking(paymentType);
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
            // Show partial confirmation inline instead of redirecting
            setConfirmedBooking({
              id: data.booking_id,
              number: data.booking_number,
              pendingAmount: verifyData.pending_amount ?? data.pending_amount,
            });
            setCashStatus('confirmed');
            setSubmitting(false);
          } else {
            router.push(`/my-bookings?success=${data.booking_id}`);
          }
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

  const totalLabel    = `₹${Math.round(totalAmount).toLocaleString('en-IN')}`;
  const advanceLabel  = `₹${partialAdvance.toLocaleString('en-IN')}`;
  const pendingLabel  = `₹${partialPending.toLocaleString('en-IN')}`;

  // ── Confirmed state (cash or partial online) ──────────────────────────────
  if (cashStatus === 'confirmed' && confirmedBooking) {
    const isPending = (confirmedBooking.pendingAmount ?? 0) > 0;
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

          {isPending ? (
            <>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm text-green-700">Paid now (advance)</span>
                <span className="font-semibold text-green-900">
                  ₹{(confirmedBooking.pendingAmount !== undefined
                    ? totalAmount - (confirmedBooking.pendingAmount ?? 0)
                    : partialAdvance
                  ).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm text-orange-600 font-semibold">Due at pickup</span>
                <span className="font-bold text-orange-700">
                  ₹{(confirmedBooking.pendingAmount ?? partialPending).toLocaleString('en-IN')}
                </span>
              </div>
              {securityDeposit > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-green-200">
                  <span className="text-sm text-green-700">Security deposit <span className="text-[10px]">(refunded after drop-off)</span></span>
                  <span className="font-semibold text-green-900">₹{securityDeposit.toLocaleString('en-IN')}</span>
                </div>
              )}
              <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
                Bring cash or UPI to pay the remaining amount at pickup.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm text-green-700">Payment</span>
                <span className="font-semibold text-green-900">Cash / UPI at pickup</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm text-green-700">Rental amount</span>
                <span className="font-semibold text-green-900">{totalLabel}</span>
              </div>
              {securityDeposit > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-green-200">
                  <span className="text-sm text-green-700">Security deposit <span className="text-[10px] text-green-600">(refunded after drop-off)</span></span>
                  <span className="font-semibold text-green-900">₹{securityDeposit.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-bold text-green-700">Total at pickup</span>
                <span className="font-bold text-green-900">₹{(totalAmount + securityDeposit).toLocaleString('en-IN')}</span>
              </div>
            </>
          )}

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

  if (cashStatus === 'confirming') {
    return (
      <div className="mt-4 rounded-2xl border-2 border-accent/40 bg-accent/5 p-6 text-center">
        <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-3" />
        <div className="font-semibold text-primary text-base">Confirming your booking…</div>
        <div className="text-sm text-muted mt-1">Usually under a second</div>
      </div>
    );
  }

  // ── Location DENIED ───────────────────────────────────────────────────────
  if (locStatus === 'denied') {
    return (
      <div className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 overflow-hidden">
        <div className="bg-red-500 px-5 py-3 flex items-center gap-2">
          <span className="text-white text-xl">📍</span>
          <span className="text-white font-bold text-base">Location Access Required</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            Zodito requires your location to complete a booking. It is used to
            verify your pickup point and ensure your safety during the rental.
          </p>
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <p className="text-xs font-bold text-gray-800 mb-2.5">How to enable location access:</p>
            <ol className="text-xs text-gray-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">1</span>
                Tap the <strong>🔒 lock icon</strong> next to the URL in your browser
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">2</span>
                Find <strong>Location</strong> → set to <strong>Allow</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">3</span>
                Come back here and tap <strong>Try Again</strong>
              </li>
            </ol>
            <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-red-100 italic">
              On iPhone: go to <strong>Settings → Safari → Location</strong> and set to Allow
            </p>
          </div>
          <button
            onClick={requestLocation}
            className="w-full py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            I&apos;ve Enabled Location — Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Location TIMEOUT ──────────────────────────────────────────────────────
  if (locStatus === 'timeout') {
    return (
      <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
        <div className="bg-amber-400 px-5 py-3 flex items-center gap-2">
          <span className="text-white text-xl">📍</span>
          <span className="text-white font-bold text-base">Location Unavailable</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            We couldn&apos;t get your location. Location is <strong>required</strong> to
            complete a booking. Please ensure GPS and location services are
            enabled on your device, then try again.
          </p>
          <div className="text-xs text-gray-500 bg-white border border-amber-200 rounded-lg p-3 space-y-1">
            <p className="font-semibold text-gray-700">Quick checklist:</p>
            <p>• Enable Wi-Fi or mobile data — improves location accuracy</p>
            <p>• On Android: pull down from top → tap Location to enable</p>
            <p>• On iPhone: Settings → Privacy → Location Services → On</p>
          </div>
          <button
            onClick={requestLocation}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Retry Location
          </button>
        </div>
      </div>
    );
  }

  // ── Normal checkout ───────────────────────────────────────────────────────
  const locReady     = locStatus === 'granted';
  const bookingReady = locReady && !disabled;

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
        strategy="lazyOnload"
      />

      {locStatus === 'pending' && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-border">
          <div className="w-3.5 h-3.5 border-2 border-muted/30 border-t-muted rounded-full animate-spin shrink-0" />
          <span className="text-xs text-muted">Getting your location for booking security…</span>
        </div>
      )}
      {locStatus === 'granted' && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
          <div className="w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white text-[8px] leading-none">✓</span>
          </div>
          <span className="text-xs text-green-700 font-medium">Location captured · booking security enabled</span>
        </div>
      )}

      {/* Payment method selector — 3 tabs */}
      <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-bg rounded-xl border border-border">
        {([
          ['online',         '🔒 Pay Full'],
          ['partial_online', '⚡ Pay 20%'],
          ['at_pickup',      '🏪 At Pickup'],
        ] as [PaymentMethod, string][]).map(([method, label]) => (
          <button
            key={method}
            onClick={() => setPaymentMethod(method)}
            className={cn(
              'py-2 px-1.5 rounded-lg text-xs font-medium transition-all leading-tight',
              paymentMethod === method ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-primary'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Context text under tab */}
      <div className="mt-2 text-[11px] text-muted text-center leading-relaxed min-h-[2.5rem]">
        {paymentMethod === 'online' && `Pay ${totalLabel} now. Booking confirmed instantly.`}
        {paymentMethod === 'partial_online' && (
          <>Pay <span className="font-semibold text-accent">{advanceLabel}</span> now online, <span className="font-semibold">{pendingLabel}</span> in cash/UPI at pickup.</>
        )}
        {paymentMethod === 'at_pickup' && 'Pay the full amount in cash or UPI when you pick up the bike.'}
      </div>

      {cashStatus === 'failed' && cashError && (
        <div className="mt-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
          {cashError}
        </div>
      )}

      {paymentMethod === 'online' && (
        <button
          onClick={() => handleOnline('full')}
          disabled={!bookingReady || submitting}
          className="btn-accent w-full text-base py-3 mt-3 disabled:bg-border disabled:cursor-not-allowed disabled:text-muted"
        >
          {submitting ? 'Processing…'
            : !locReady  ? 'Getting location…'
            : disabled   ? 'Select pickup time'
            : `Pay & Confirm · ${totalLabel}`}
        </button>
      )}

      {paymentMethod === 'partial_online' && (
        <button
          onClick={() => handleOnline('partial')}
          disabled={!bookingReady || submitting}
          className="btn-accent w-full text-base py-3 mt-3 disabled:bg-border disabled:cursor-not-allowed disabled:text-muted"
        >
          {submitting ? 'Processing…'
            : !locReady  ? 'Getting location…'
            : disabled   ? 'Select pickup time'
            : `Pay ${advanceLabel} Now · Rest at Pickup`}
        </button>
      )}

      {paymentMethod === 'at_pickup' && (
        <button
          onClick={handleAtPickup}
          disabled={!bookingReady}
          className="w-full text-base py-3 mt-3 rounded-xl font-semibold border-2 border-accent text-accent hover:bg-accent hover:text-white transition-all disabled:border-border disabled:text-muted disabled:cursor-not-allowed"
        >
          {!locReady ? 'Getting location…'
            : disabled  ? 'Select pickup time'
            : `Confirm Booking · ${totalLabel}`}
        </button>
      )}
    </>
  );
}
