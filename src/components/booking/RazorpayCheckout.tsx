'use client';

import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { PackageTier } from '@/lib/supabase/types';
import { useBookingLocation } from './razorpay/useBookingLocation';
import { buildBookingPayload } from './razorpay/bookingPayload';
import { openRazorpay } from './razorpay/openRazorpay';
import { ConfirmedBookingPanel, type ConfirmedBooking } from './razorpay/ConfirmedBookingPanel';
import { LocationDeniedPanel } from './razorpay/LocationDeniedPanel';
import { LocationTimeoutPanel } from './razorpay/LocationTimeoutPanel';
import { PaymentMethodTabs, type PaymentMethod } from './razorpay/PaymentMethodTabs';

declare global {
  interface Window { Razorpay: any; }
}

type CashStatus = 'idle' | 'confirming' | 'confirmed' | 'failed';

export function RazorpayCheckout({
  bikeId,
  tier,
  customPackageId,
  actualDays,
  durationHours,
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
  durationHours?: number;
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
  const { locationRef, locStatus, requestLocation } = useBookingLocation();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  const [cashStatus, setCashStatus]             = useState<CashStatus>('idle');
  const [cashError, setCashError]               = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Minimum advance for partial payment: 20% rounded up
  const partialAdvance = Math.ceil(totalAmount * 0.20);
  const partialPending = totalAmount - partialAdvance;

  const payloadArgs = () => ({
    bikeId, tier, customPackageId, actualDays, durationHours,
    pickupTs: pickupTs!,
    extraHelmets, mobileHolder, couponCode,
    location: locationRef.current!,
  });

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
        body: JSON.stringify(buildBookingPayload(payloadArgs())),
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
  async function createOnlineBooking(paymentType: 'full' | 'partial') {
    if (!pickupTs || !locationRef.current) return null;
    setError(null);
    setSubmitting(true);

    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBookingPayload(payloadArgs(), paymentType)),
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
      const data = await createOnlineBooking(paymentType);
      if (!data) return;

      if (data.mock) {
        router.push(`/my-bookings?success=${data.booking_id}`);
        return;
      }

      openRazorpay({
        data,
        onPartialConfirmed: (info) => {
          setConfirmedBooking(info);
          setCashStatus('confirmed');
          setSubmitting(false);
        },
        onFullSuccess: (bookingId) => router.push(`/my-bookings?success=${bookingId}`),
        onError: (msg) => { setError(msg); setSubmitting(false); },
        onDismiss: () => setSubmitting(false),
      });
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
    return (
      <ConfirmedBookingPanel
        booking={confirmedBooking}
        totalAmount={totalAmount}
        securityDeposit={securityDeposit}
        partialAdvance={partialAdvance}
        partialPending={partialPending}
      />
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

  if (locStatus === 'denied')  return <LocationDeniedPanel onRetry={requestLocation} />;
  if (locStatus === 'timeout') return <LocationTimeoutPanel onRetry={requestLocation} />;

  // ── Normal checkout ───────────────────────────────────────────────────────
  const locReady     = locStatus === 'granted';
  const bookingReady = locReady && !disabled;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

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

      <PaymentMethodTabs value={paymentMethod} onChange={setPaymentMethod} />

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
