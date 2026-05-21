'use client';

import { useState } from 'react';
import { formatIstDateTime } from '@/lib/datetime';

type Booking = {
  id: string;
  booking_number: string;
  status: string;
  start_ts: string;
  end_ts: string;
  total_amount: number;
  advance_paid?: number;
  pending_amount?: number;
  km_limit: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  alternate_phone?: string | null;
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  bike: {
    id: string;
    emoji?: string | null;
    image_url?: string | null;
    registration_number?: string | null;
    color?: string | null;
    extra_km_rate?: number | null;
    late_penalty_hour?: number | null;
    model: { display_name: string; cc?: number | null; late_hourly_penalty?: number | null } | null;
  } | null;
};

function rupee(n: number) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function customerOf(b: Booking) {
  if (b.user?.first_name || b.user?.last_name) {
    return [b.user.first_name, b.user.last_name].filter(Boolean).join(' ');
  }
  return b.customer_name?.trim() || '—';
}
function phoneOf(b: Booking) {
  return b.user?.phone ?? b.customer_phone ?? '';
}

export function OverdueBoard({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-10 text-center">
        <div className="text-5xl mb-2">✅</div>
        <p className="font-semibold text-lg">All clear</p>
        <p className="text-sm text-muted mt-1">No overdue bookings to settle.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map(b => (
        <OverdueRow
          key={b.id}
          booking={b}
          onSettled={() => setBookings(prev => prev.filter(x => x.id !== b.id))}
        />
      ))}
    </div>
  );
}

function OverdueRow({ booking, onSettled }: { booking: Booking; onSettled: () => void }) {
  const isPickupOverdue = booking.status === 'confirmed';
  const overdueRef = isPickupOverdue ? booking.start_ts : booking.end_ts;
  const hoursOverdue = Math.max(0, Math.ceil((Date.now() - new Date(overdueRef).getTime()) / 3_600_000));
  const ratePerHour  = Number(booking.bike?.late_penalty_hour ?? booking.bike?.model?.late_hourly_penalty ?? 49);
  const penaltySoFar = hoursOverdue * ratePerHour;

  const [showCompose, setShowCompose] = useState(false);

  return (
    <div className="rounded-xl border-2 border-red-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-red-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-10 h-10 rounded-md bg-border/40 flex items-center justify-center shrink-0 overflow-hidden">
            {booking.bike?.image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={booking.bike.image_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-lg">{booking.bike?.emoji ?? '🏍️'}</span>}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">
              {booking.bike?.model?.display_name ?? '—'} · <span className="font-mono text-accent">{booking.booking_number}</span>
            </div>
            <div className="text-xs text-muted truncate">
              {customerOf(booking)}{phoneOf(booking) && ` · ${phoneOf(booking)}`}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-700">
            {isPickupOverdue ? 'Pickup overdue' : 'Return overdue'}
          </div>
          <div className="text-sm font-bold text-red-700">{hoursOverdue} hr · {rupee(penaltySoFar)} est</div>
        </div>
      </div>

      <div className="px-4 py-3 text-xs text-muted flex flex-wrap gap-x-6 gap-y-1">
        <span>Pickup <strong className="text-primary font-medium">{formatIstDateTime(booking.start_ts)}</strong></span>
        <span>Drop-off <strong className="text-primary font-medium">{formatIstDateTime(booking.end_ts)}</strong></span>
        <span>Pending <strong className="text-orange-600 font-semibold">{rupee(booking.pending_amount ?? 0)}</strong></span>
      </div>

      <div className="px-4 pb-3">
        {!showCompose ? (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowCompose(true)}
              className="text-xs px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
            >
              💸 Negotiate & send payment link
            </button>
            <a
              href={`/admin/bookings`}
              className="text-xs px-3 py-2 bg-border text-primary rounded-lg hover:bg-border/70 font-medium"
            >
              Open in main list
            </a>
          </div>
        ) : (
          <SettlementInline
            booking={booking}
            hoursOverdue={hoursOverdue}
            ratePerHour={ratePerHour}
            penaltySoFar={penaltySoFar}
            onCancel={() => setShowCompose(false)}
            onSettled={onSettled}
          />
        )}
      </div>
    </div>
  );
}

// Inline settlement composer — mirror of the modal-embedded SettlementComposer
// but designed for stacking on a triage board. Same POST endpoint, same WhatsApp
// generator, just sized for an in-place expansion.
function SettlementInline({
  booking, hoursOverdue, ratePerHour, penaltySoFar, onCancel, onSettled,
}: {
  booking: Booking;
  hoursOverdue: number;
  ratePerHour: number;
  penaltySoFar: number;
  onCancel: () => void;
  onSettled: () => void;
}) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [amount, setAmount]     = useState('');
  const [perDayRate, setPerDayRate] = useState('');
  const [extraDays, setExtraDays]   = useState('1');
  const [newDate, setNewDate]   = useState(todayDate);
  const [newHour, setNewHour]   = useState<number>(20);
  const [note, setNote]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [created, setCreated]   = useState<{ extension_id: string; amount: number; new_end_ts: string; expires_at: string } | null>(null);

  const perDayCalc = Math.round(Number(perDayRate || 0) * Number(extraDays || 0));

  async function generate() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter the amount'); return; }
    if (!newDate) { setError('Pick a new drop-off date'); return; }
    setSubmitting(true);
    try {
      const newEndIso = new Date(`${newDate}T${String(newHour).padStart(2, '0')}:00:00`).toISOString();
      const res = await fetch('/api/admin/bookings/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, amount: amt, new_end_ts: newEndIso, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create settlement'); return; }
      setCreated(data);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  function share() {
    if (!created) return;
    const raw = phoneOf(booking) || booking.alternate_phone || '';
    const digits = String(raw).replace(/\D+/g, '');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const deepLink = `${origin}/my-bookings/${booking.id}?ext=${created.extension_id}`;
    const lines = [
      `Hi ${customerOf(booking)},`,
      ``,
      `Your booking #${booking.booking_number} (${booking.bike?.model?.display_name ?? 'bike'}) is overdue.`,
      ``,
      `As agreed, here is the payment link:`,
      `Amount: ${rupee(created.amount)}`,
      `New drop-off: ${formatIstDateTime(created.new_end_ts)}`,
      ...(note ? [`Note: ${note}`] : []),
      ``,
      `Tap to pay:`,
      deepLink,
      ``,
      `Booking is extended automatically once payment succeeds.`,
      ``,
      `- Zodito Rentals`,
    ];
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    // Optimistic — remove from the board so the operator can focus on the next one.
    onSettled();
  }

  if (created) {
    return (
      <div className="rounded-lg border-2 border-green-300 bg-green-50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span>✓</span>
          <span className="font-semibold text-green-900">Settlement link ready · {rupee(created.amount)} → {formatIstDateTime(created.new_end_ts)}</span>
        </div>
        <button
          onClick={share}
          className="w-full py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700"
        >
          📤 Send Payment Link via WhatsApp
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-3">
      <p className="text-[11px] text-red-800 leading-relaxed">
        Auto-computed penalty <strong>{rupee(penaltySoFar)}</strong> ({hoursOverdue} hr × ₹{ratePerHour}/hr) — set the actual amount you agreed with the customer.
      </p>

      <div className="rounded-md bg-white border border-red-100 p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 items-end text-[11px]">
        <div>
          <label className="text-[10px] text-muted block mb-0.5">Per-day rate (₹)</label>
          <input type="number" min={0} step={50} value={perDayRate} onChange={e => setPerDayRate(e.target.value)} placeholder="500" className="input-field w-full text-sm py-1.5 px-2" />
        </div>
        <div>
          <label className="text-[10px] text-muted block mb-0.5">× days</label>
          <input type="number" min={1} step={1} value={extraDays} onChange={e => setExtraDays(e.target.value)} className="input-field w-full text-sm py-1.5 px-2" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">= {rupee(perDayCalc)}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAmount(String(perDayCalc))} disabled={perDayCalc <= 0} className="text-[10px] text-accent hover:underline disabled:text-muted font-semibold">Per-day</button>
            <button type="button" onClick={() => setAmount(String(Math.round(hoursOverdue * ratePerHour)))} className="text-[10px] text-accent hover:underline font-semibold">Hourly</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Amount (₹) *</label>
          <input type="number" min={1} step={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="1500" className="input-field w-full text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">New drop-off *</label>
          <input type="date" value={newDate} min={todayDate} onChange={e => setNewDate(e.target.value)} className="input-field w-full text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Hour</label>
          <select value={newHour} onChange={e => setNewHour(parseInt(e.target.value, 10))} className="input-field w-full text-sm">
            {Array.from({ length: 17 }, (_, i) => 6 + i).map(h => {
              const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
              return <option key={h} value={h}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Note (optional — sent in WhatsApp)</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. ₹500 × 3 days at agreed flat rate" className="input-field w-full text-sm" />
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-2 border border-border rounded-lg hover:bg-bg/60">
          Cancel
        </button>
        <button
          onClick={generate}
          disabled={submitting || !amount}
          className="text-xs px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 font-semibold"
        >
          {submitting ? 'Creating…' : `Generate · ${amount ? rupee(Number(amount)) : '—'}`}
        </button>
      </div>
    </div>
  );
}
