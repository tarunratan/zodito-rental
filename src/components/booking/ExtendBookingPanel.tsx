'use client';

/**
 * Customer-side booking-extension flow.
 *
 * Lifecycle:
 *   idle    – datetime input + Get Quote button
 *   quoting – fetching /extend/quote
 *   quoted  – breakdown shown + Pay & Extend button
 *   paying  – Razorpay open
 *   success – booking updated, banner shown
 *   failed  – payment failed/dismissed, original booking unchanged
 *
 * The booking's end_ts and km_limit are only mutated server-side by
 * /extend/verify AFTER a successful Razorpay signature check. If anything
 * fails (or the user closes the modal), the booking is untouched.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { formatINR, formatDateTime } from '@/lib/utils';

// Store hours window — drop-offs are accepted between 6 AM and 10 PM only.
// Matches `STORE_OPEN_HOUR` / `STORE_CLOSE_HOUR` in src/lib/pricing.ts.
const EXTEND_HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 6..22 inclusive
function fmtHour12(h: number): string {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

declare global { interface Window { Razorpay: any } }

interface Quote {
  extraHours: number;
  extraKm: number;
  originalKmLimit: number;
  newKmLimit: number;
  baseDelta: number;
  gstDelta: number;
  totalDelta: number;
  matchedTier: string | null;
  matchedLabel: string;
}

interface QuoteResponse {
  quote: Quote;
  available: boolean;
  conflict?: { booking_id: string; booking_number: string; end_ts: string };
  error?: string;
}

interface ExtensionEntry {
  id: string;
  status: 'pending_payment' | 'confirmed' | 'failed' | 'expired';
  original_end_ts: string;
  new_end_ts: string;
  extra_hours: number;
  extra_km: number;
  original_km_limit: number;
  new_km_limit: number;
  total_delta: number;
  matched_tier: string | null;
  paid_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<ExtensionEntry['status'], string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  confirmed:       'bg-green-100 text-green-700',
  failed:          'bg-red-100 text-red-700',
  expired:         'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<ExtensionEntry['status'], string> = {
  pending_payment: 'Extension Pending Payment',
  confirmed:       'Extension Confirmed',
  failed:          'Extension Failed',
  expired:         'Extension Expired',
};

export function ExtendBookingPanel({
  bookingId,
  bookingNumber,
  status,
  endTs,
  kmLimit,
}: {
  bookingId: string;
  bookingNumber: string;
  status: string;
  endTs: string;
  kmLimit: number;
}) {
  const [open, setOpen]           = useState(false);
  // Drop-off as date + 12-hour-clock hour (no minutes). Combined to an ISO
  // timestamp lazily when we need to fire the quote / payment call.
  const [newDate, setNewDate]     = useState('');
  const [newHour, setNewHour]     = useState<number>(10); // default 10 AM
  const newEnd                    = newDate
    ? new Date(`${newDate}T${String(newHour).padStart(2, '0')}:00:00`).toISOString()
    : '';
  const [quote, setQuote]         = useState<Quote | null>(null);
  const [conflict, setConflict]   = useState<QuoteResponse['conflict'] | null>(null);
  const [phase, setPhase]         = useState<'idle' | 'quoting' | 'quoted' | 'paying' | 'success' | 'failed'>('idle');
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<{ end_ts: string; km_limit: number } | null>(null);
  const [history, setHistory]     = useState<ExtensionEntry[] | null>(null);

  // Load history (always — so completed extensions show up even when panel closed)
  useEffect(() => {
    let abort = false;
    fetch(`/api/bookings/${bookingId}/extensions`)
      .then(r => r.ok ? r.json() : { extensions: [] })
      .then(d => { if (!abort) setHistory(d.extensions ?? []); })
      .catch(() => { if (!abort) setHistory([]); });
    return () => { abort = true; };
  }, [bookingId, success]);

  if (status !== 'ongoing' && (!history || history.length === 0)) {
    // Hide entirely if booking can't be extended and there's nothing to show.
    return null;
  }

  function resetQuote() {
    setQuote(null);
    setConflict(null);
    setError(null);
    setPhase('idle');
  }

  async function fetchQuote() {
    if (!newEnd) { setError('Pick a new drop-off date & time'); return; }
    setError(null);
    setPhase('quoting');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extend/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_end_ts: newEnd }),
      });
      const data: QuoteResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not fetch quote');
        setPhase('idle');
        return;
      }
      if (!data.available) {
        setConflict(data.conflict ?? null);
        setError(data.error ?? 'Bike not available for this period');
      }
      setQuote(data.quote ?? null);
      setPhase('quoted');
    } catch {
      setError('Network error — please try again');
      setPhase('idle');
    }
  }

  async function payAndExtend() {
    if (!newEnd || !quote) return;
    setError(null);
    setPhase('paying');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extend/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_end_ts: newEnd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start payment');
        setPhase('quoted');
        return;
      }

      if (typeof window.Razorpay === 'undefined') {
        setError('Payment gateway not loaded — please refresh and try again.');
        setPhase('quoted');
        return;
      }

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        order_id: data.razorpay.order_id,
        name: 'Zodito Rentals',
        description: `Extension for booking ${bookingNumber}`,
        prefill: data.prefill,
        theme: { color: '#f97316' },
        handler: async (resp: any) => {
          const verifyRes = await fetch(`/api/bookings/${bookingId}/extend/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              extension_id: data.extension_id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) {
            setError(verifyData.error ?? 'Payment verification failed');
            setPhase('failed');
            return;
          }
          setSuccess({ end_ts: verifyData.new_end_ts, km_limit: verifyData.new_km_limit });
          setPhase('success');
          setOpen(false);
        },
        modal: { ondismiss: () => { setPhase('quoted'); } },
      });
      rzp.on('payment.failed', (resp: any) => {
        setError(resp.error?.description || 'Payment failed.');
        setPhase('failed');
      });
      rzp.open();
    } catch {
      setError('Network error during payment setup.');
      setPhase('quoted');
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="font-display font-semibold text-lg">Extend booking</h2>
            <p className="text-xs text-muted mt-0.5">
              Current drop-off: <span className="font-medium text-primary">{formatDateTime(endTs)}</span> · {kmLimit} km included
            </p>
          </div>
          {status === 'ongoing' && (
            <button
              onClick={() => { setOpen(o => !o); resetQuote(); }}
              className="text-xs font-semibold bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent/90"
            >
              {open ? 'Close' : 'Extend Booking →'}
            </button>
          )}
        </div>

        {success && (
          <div className="mt-3 rounded-lg border-2 border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <div className="font-semibold">Extension confirmed ✓</div>
            <div className="text-xs mt-1">
              New drop-off: <strong>{formatDateTime(success.end_ts)}</strong> · KM limit now <strong>{success.km_limit} km</strong>
            </div>
          </div>
        )}

        {open && status === 'ongoing' && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] text-muted block mb-1">New drop-off date & time</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  min={endTs.slice(0, 10)}
                  onChange={e => { setNewDate(e.target.value); resetQuote(); }}
                  className="input-field flex-1 text-sm"
                />
                <select
                  value={newHour}
                  onChange={e => { setNewHour(parseInt(e.target.value, 10)); resetQuote(); }}
                  className="input-field text-sm w-28"
                >
                  {EXTEND_HOURS.map(h => (
                    <option key={h} value={h}>{fmtHour12(h)}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-muted mt-1">
                Drop-offs accepted 6 AM – 10 PM. Pick the date and hour only — minutes aren&apos;t needed.
              </p>
            </div>

            <button
              onClick={fetchQuote}
              disabled={!newEnd || phase === 'quoting'}
              className="w-full py-2 text-sm font-semibold border border-accent text-accent rounded-lg hover:bg-accent/5 disabled:opacity-50"
            >
              {phase === 'quoting' ? 'Calculating…' : 'Get Quote'}
            </button>

            {quote && (
              <div className="rounded-lg border border-border bg-bg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted">Extra duration</span><span className="font-semibold">{quote.extraHours.toFixed(1)} hrs</span></div>
                <div className="flex justify-between"><span className="text-muted">Extra KM allowance</span><span className="font-semibold">+{quote.extraKm} km</span></div>
                <div className="flex justify-between"><span className="text-muted">New KM limit</span><span className="font-semibold">{quote.newKmLimit} km</span></div>
                <div className="border-t border-border my-1.5" />
                <div className="flex justify-between"><span className="text-muted">Extra rent</span><span>{formatINR(quote.baseDelta)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Extra GST (18%)</span><span>{formatINR(quote.gstDelta)}</span></div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-display font-semibold">Total payable (incl. GST)</span>
                  <span className="font-display font-bold text-accent">{formatINR(quote.totalDelta)}</span>
                </div>
                <p className="text-[10px] text-muted mt-2">
                  Includes 18% GST. Booking is only extended after successful payment.
                </p>
              </div>
            )}

            {conflict && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                Another booking (#{conflict.booking_number}) starts before your requested drop-off. Pick an earlier time.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
            )}

            {quote && !conflict && (
              <button
                onClick={payAndExtend}
                disabled={phase === 'paying'}
                className="btn-accent w-full text-sm py-2.5 disabled:opacity-50"
              >
                {phase === 'paying' ? 'Opening payment…' : `Pay ${formatINR(quote.totalDelta)} & Extend`}
              </button>
            )}
          </div>
        )}

        {history && history.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[10px] text-muted uppercase tracking-wide font-semibold mb-2">Extension history</p>
            <ul className="space-y-2">
              {history.map(h => (
                <li key={h.id} className="text-xs rounded-lg border border-border bg-bg/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[h.status]}`}>
                      {STATUS_LABEL[h.status]}
                    </span>
                    <span className="text-muted text-[10px]">{formatDateTime(h.created_at)}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-muted">From</span><span>{formatDateTime(h.original_end_ts)}</span>
                    <span className="text-muted">To</span><span>{formatDateTime(h.new_end_ts)}</span>
                    <span className="text-muted">Extra KM</span><span>+{h.extra_km} km · total {h.new_km_limit}</span>
                    <span className="text-muted">Amount</span><span>{formatINR(h.total_delta)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
