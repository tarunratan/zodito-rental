'use client';

import { useState } from 'react';

type Booking = {
  id: string;
  booking_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  base_price: number;
  gst_amount: number;
  security_deposit: number;
  package_tier: string;
  start_ts: string;
  end_ts: string;
  picked_up_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  razorpay_payment_id: string | null;
  final_km_used: number | null;
  excess_km_charge: number;
  damage_charge: number;
  notes: string | null;
  created_at: string;
  source?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  booking_lat?: number | null;
  booking_lng?: number | null;
  booking_ip?: string | null;
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  bike: { id: string; registration_number: string | null; color: string | null; emoji: string; model: { display_name: string } | null } | null;
};

function customerInfo(b: Booking) {
  const name = b.user?.first_name || b.user?.last_name
    ? [b.user!.first_name, b.user!.last_name].filter(Boolean).join(' ')
    : (b.customer_name?.trim() || null);
  const email = b.user?.email ?? null;
  const phone = b.user?.phone ?? b.customer_phone ?? null;
  return { name, email, phone, isManual: b.source === 'manual' };
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  ongoing: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  payment_failed: 'bg-gray-100 text-gray-500',
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-blue-100 text-blue-700',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function rupee(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function BookingLocation({ booking }: { booking: Booking }) {
  const hasGps = booking.booking_lat != null && booking.booking_lng != null;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${booking.booking_lat},${booking.booking_lng}`
    : null;

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${hasGps ? 'border-orange-400' : 'border-border'}`}>
      <div className={`px-4 py-2 flex items-center gap-2 ${hasGps ? 'bg-orange-400' : 'bg-bg border-b border-border'}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${hasGps ? 'text-white' : 'text-muted'}`}>
          {hasGps ? '📍 Booking Location — GPS captured' : booking.booking_ip ? '🌐 Booking Location — IP only' : '◌ Booking Location'}
        </span>
      </div>
      <div className="px-4 py-3 bg-white">
        {booking.source === 'manual' ? (
          <p className="text-xs text-muted">Admin-created booking — no customer location captured.</p>
        ) : hasGps ? (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide mb-1">GPS Coordinates</p>
              <p className="font-mono text-sm select-all">{booking.booking_lat!.toFixed(6)}, {booking.booking_lng!.toFixed(6)}</p>
              {booking.booking_ip && <p className="text-[11px] text-muted mt-1">IP: {booking.booking_ip}</p>}
            </div>
            <a
              href={mapsUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors shrink-0"
            >
              📍 Open in Google Maps
            </a>
          </div>
        ) : booking.booking_ip ? (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide mb-1">IP Address (GPS not available)</p>
              <p className="font-mono text-sm select-all">{booking.booking_ip}</p>
              <p className="text-[11px] text-muted mt-1">Customer denied location permission — IP is the only signal.</p>
            </div>
            <a
              href={`https://ipinfo.io/${booking.booking_ip}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-border text-primary text-sm font-semibold rounded-lg hover:bg-border/70 transition-colors shrink-0"
            >
              🌐 Look up IP location
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted">No location data — booking predates this feature.</p>
        )}
      </div>
    </div>
  );
}

type BikeOption = { id: string; emoji: string; registration_number: string | null; model: { display_name: string } | null };

const EMPTY_MANUAL = { bike_id: '', customer_name: '', customer_phone: '', customer_email: '', total_amount: '', start_ts: '', end_ts: '', notes: '' };

export function BookingsManager({ initialBookings, allBikes = [] }: { initialBookings: Booking[]; allBikes?: BikeOption[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; action: string } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ ...EMPTY_MANUAL });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const allStatuses = ['all', 'confirmed', 'ongoing', 'pending_payment', 'completed', 'cancelled', 'payment_failed'];
  const counts = allStatuses.reduce<Record<string, number>>((acc, s) => {
    if (s === 'all') { acc[s] = bookings.length; return acc; }
    if (s === 'ongoing') {
      acc[s] = bookings.filter(b =>
        b.status === 'ongoing' || (b.status === 'confirmed' && new Date(b.start_ts) <= new Date())
      ).length;
      return acc;
    }
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {});

  const now = new Date();

  // "ongoing" filter: actual ongoing + confirmed bookings whose pickup time has passed
  function matchesFilter(b: Booking) {
    if (filter === 'all') return true;
    if (filter === 'ongoing') {
      return b.status === 'ongoing' ||
        (b.status === 'confirmed' && new Date(b.start_ts) <= now);
    }
    return b.status === filter;
  }

  const filtered = bookings.filter(b => {
    if (!matchesFilter(b)) return false;
    if (search) {
      const q = search.toLowerCase();
      const c = customerInfo(b);
      return (
        b.booking_number.toLowerCase().includes(q) ||
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (b.customer_name ?? '').toLowerCase().includes(q) ||
        (b.bike?.registration_number ?? '').toLowerCase().includes(q) ||
        (b.bike?.model?.display_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function updateStatus(booking_id: string, status: string, notes?: string) {
    setLoading(booking_id);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/bookings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // undefined is omitted by JSON.stringify — never sends null to the server
        body: JSON.stringify({ booking_id, status, reason: notes || undefined }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b => {
          if (b.id !== booking_id) return b;
          const now = new Date().toISOString();
          if (status === 'ongoing') return { ...b, status: 'ongoing', picked_up_at: now };
          if (status === 'completed') return { ...b, status: 'completed', returned_at: now };
          if (status === 'cancelled') return { ...b, status: 'cancelled', cancelled_at: now, cancellation_reason: notes || null };
          if (status === 'refunded') return { ...b, payment_status: 'refunded' };
          return b;
        }));
        setActionModal(null);
        setActionNotes('');
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? `Failed to update booking (${res.status})`);
      }
    } catch {
      setActionError('Network error — please check your connection and try again');
    } finally {
      setLoading(null);
    }
  }

  async function createManualBooking() {
    setManualError(null);
    if (!manualForm.bike_id || !manualForm.customer_name.trim() || !manualForm.customer_phone.trim() || !manualForm.start_ts || !manualForm.end_ts) {
      setManualError('Bike, customer name, phone, and dates are all required');
      return;
    }
    setManualLoading(true);
    const res = await fetch('/api/admin/bookings/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bike_id: manualForm.bike_id,
        customer_name: manualForm.customer_name.trim(),
        customer_phone: manualForm.customer_phone.trim(),
        customer_email: manualForm.customer_email.trim() || undefined,
        start_ts: new Date(manualForm.start_ts).toISOString(),
        end_ts: new Date(manualForm.end_ts).toISOString(),
        total_amount: manualForm.total_amount ? parseFloat(manualForm.total_amount) : 0,
        notes: manualForm.notes || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setManualError(data.error ?? 'Failed to create booking');
    } else {
      setShowManual(false);
      setManualForm({ ...EMPTY_MANUAL });
      window.location.reload();
    }
    setManualLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">All Bookings</h2>
        <button onClick={() => { setShowManual(true); setManualForm({ ...EMPTY_MANUAL }); setManualError(null); }}
          className="text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/90 font-medium">
          + Manual Booking
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {['all', 'confirmed', 'ongoing', 'pending_payment', 'completed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${
              filter === s ? 'bg-accent text-white' : 'bg-border/60 text-muted hover:bg-border'
            }`}
          >
            {s.replace('_', ' ')}
            {counts[s] > 0 && (
              <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${filter === s ? 'bg-white/20' : 'bg-muted/20'}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by booking #, email, bike reg, or model…"
          className="input-field w-full max-w-sm"
        />
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">No bookings found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Booking</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Bike</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Dates</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <>
                    <tr
                      key={b.id}
                      className={`border-b border-border hover:bg-bg/40 cursor-pointer transition-colors ${expanded === b.id ? 'bg-bg/60' : ''}`}
                      onClick={() => setExpanded(e => e === b.id ? null : b.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-accent">{b.booking_number}</div>
                        <div className="text-xs text-muted">{fmt(b.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const c = customerInfo(b);
                          return (
                            <>
                              <div className="font-medium flex items-center gap-1.5 flex-wrap">
                                <span>{c.name || <span className="text-muted italic text-xs">No name</span>}</span>
                                {c.isManual && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded shrink-0">Offline</span>
                                )}
                              </div>
                              {c.phone
                                ? <div className="text-xs text-muted">{c.phone}</div>
                                : <div className="text-xs text-red-400 italic">No phone</div>
                              }
                              {c.email && <div className="text-xs text-muted">{c.email}</div>}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg">{b.bike?.emoji ?? '🏍️'}</span>
                          <div>
                            <div className="font-medium text-xs">{b.bike?.model?.display_name ?? '—'}</div>
                            <div className="text-xs text-muted font-mono">{b.bike?.registration_number ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-muted">From: {fmt(b.start_ts)}</div>
                        <div className="text-muted">To: {fmt(b.end_ts)}</div>
                        <div className="font-medium mt-0.5 capitalize">{b.package_tier}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{rupee(b.total_amount)}</div>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${PAYMENT_COLORS[b.payment_status] ?? ''}`}>
                          {b.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? ''}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          {b.status === 'confirmed' && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'ongoing' }); setActionError(null); }} disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100 transition-colors disabled:opacity-50">
                              Mark Pickup
                            </button>
                          )}
                          {b.status === 'ongoing' && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'completed' }); setActionError(null); }} disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors disabled:opacity-50">
                              Mark Return
                            </button>
                          )}
                          {['confirmed', 'ongoing', 'pending_payment'].includes(b.status) && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'cancelled' }); setActionNotes(''); setActionError(null); }}
                              className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                              Cancel
                            </button>
                          )}
                          {b.status === 'cancelled' && b.payment_status === 'paid' && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'refunded' }); setActionError(null); }}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors">
                              Refund
                            </button>
                          )}
                          <button onClick={() => setExpanded(e => e === b.id ? null : b.id)}
                            className="text-xs px-2 py-1 bg-border text-primary rounded hover:bg-border/70 transition-colors">
                            {expanded === b.id ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === b.id && (
                      <tr key={`${b.id}-exp`} className="border-b border-border bg-bg/30">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Pricing</p>
                              <p>Base: {rupee(b.base_price)}</p>
                              <p>GST: {rupee(b.gst_amount)}</p>
                              <p>Deposit: {rupee(b.security_deposit)}</p>
                              {b.excess_km_charge > 0 && <p>Excess KM: {rupee(b.excess_km_charge)}</p>}
                              {b.damage_charge > 0 && <p>Damage: {rupee(b.damage_charge)}</p>}
                              <p className="font-semibold mt-1">Total: {rupee(b.total_amount)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Timeline</p>
                              {b.picked_up_at && <p className="text-xs">Picked up: {fmt(b.picked_up_at)}</p>}
                              {b.returned_at && <p className="text-xs">Returned: {fmt(b.returned_at)}</p>}
                              {b.cancelled_at && <p className="text-xs text-red-500">Cancelled: {fmt(b.cancelled_at)}</p>}
                              {b.final_km_used != null && <p className="text-xs">KM used: {b.final_km_used}</p>}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Payment</p>
                              {b.razorpay_payment_id && <p className="text-xs font-mono text-muted">{b.razorpay_payment_id}</p>}
                              <p className="text-xs capitalize">{b.payment_status}</p>
                            </div>
                            {(b.notes || b.cancellation_reason) && (
                              <div>
                                <p className="text-xs font-semibold text-muted uppercase mb-1">Notes</p>
                                <p className="text-xs text-muted">{b.notes || b.cancellation_reason}</p>
                              </div>
                            )}
                          </div>

                          {/* ── Booking Location ── */}
                          <BookingLocation booking={b} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold capitalize">
              {actionModal.action === 'ongoing' ? 'Mark as Picked Up?' :
               actionModal.action === 'completed' ? 'Mark as Returned?' :
               actionModal.action === 'cancelled' ? 'Cancel Booking?' : 'Process Refund?'}
            </h3>
            {['cancelled', 'completed'].includes(actionModal.action) && (
              <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                className="input-field w-full h-20 resize-none"
                placeholder={actionModal.action === 'cancelled' ? 'Cancellation reason (optional)' : 'Return notes (optional)'} />
            )}
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {actionError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setActionError(null); }}
                className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => updateStatus(actionModal.id, actionModal.action, actionNotes)}
                disabled={loading === actionModal.id}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-60 ${actionModal.action === 'cancelled' ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'}`}
              >
                {loading === actionModal.id ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual booking modal */}
      {showManual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Manual / Offline Booking</h3>
              <button onClick={() => setShowManual(false)} className="text-muted hover:text-primary text-xl">✕</button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Bike <span className="text-danger">*</span></label>
              <select value={manualForm.bike_id} onChange={e => setManualForm(f => ({ ...f, bike_id: e.target.value }))} className="input-field w-full">
                <option value="">Select a bike…</option>
                {allBikes.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.emoji} {b.model?.display_name ?? 'Unknown'}{b.registration_number ? ` · ${b.registration_number}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer info */}
            <div>
              <label className="block text-xs font-medium mb-1">Customer name <span className="text-red-500">*</span></label>
              <input value={manualForm.customer_name} onChange={e => setManualForm(f => ({ ...f, customer_name: e.target.value }))}
                className="input-field w-full" placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Phone <span className="text-red-500">*</span></label>
                <input value={manualForm.customer_phone} onChange={e => setManualForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="input-field w-full" placeholder="+91 98765 43210" type="tel" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email <span className="text-xs text-muted font-normal">(optional)</span></label>
                <input value={manualForm.customer_email} onChange={e => setManualForm(f => ({ ...f, customer_email: e.target.value }))}
                  className="input-field w-full" placeholder="customer@email.com" type="email" />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Pickup <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, start_ts: e.target.value }))}
                  className="input-field w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Drop-off <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={manualForm.end_ts} min={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, end_ts: e.target.value }))}
                  className="input-field w-full text-sm" />
              </div>
            </div>

            {/* Amount + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Amount collected (₹)</label>
                <input value={manualForm.total_amount} onChange={e => setManualForm(f => ({ ...f, total_amount: e.target.value }))}
                  className="input-field w-full" placeholder="0" type="number" min="0" step="1" />
                <p className="text-[11px] text-muted mt-0.5">Leave 0 if not yet collected</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <input value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-field w-full" placeholder="e.g. Cash collected at pickup" />
              </div>
            </div>

            {manualError && <p className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">{manualError}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowManual(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
              <button onClick={createManualBooking} disabled={manualLoading}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">
                {manualLoading ? 'Creating…' : 'Create Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
