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
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  bike: { id: string; registration_number: string | null; color: string | null; emoji: string; model: { display_name: string } | null } | null;
};

function customerInfo(b: Booking) {
  const name =
    (b.user?.first_name || b.user?.last_name)
      ? [b.user.first_name, b.user.last_name].filter(Boolean).join(' ')
      : (b.customer_name ?? '—');
  const email = b.user?.email ?? null;
  const phone = b.user?.phone ?? b.customer_phone ?? null;
  return { name, email, phone };
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

type BikeOption = { id: string; emoji: string; registration_number: string | null; model: { display_name: string } | null };

const EMPTY_MANUAL = { bike_id: '', customer_name: '', customer_phone: '', start_ts: '', end_ts: '', notes: '' };

export function BookingsManager({ initialBookings, allBikes = [] }: { initialBookings: Booking[]; allBikes?: BikeOption[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; action: string } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ ...EMPTY_MANUAL });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const allStatuses = ['all', 'confirmed', 'ongoing', 'pending_payment', 'completed', 'cancelled', 'payment_failed'];
  const counts = allStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = s === 'all' ? bookings.length : bookings.filter(b => b.status === s).length;
    return acc;
  }, {});

  const filtered = bookings.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const c = customerInfo(b);
      return (
        b.booking_number.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
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
    const res = await fetch('/api/admin/bookings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id, status, reason: notes || null }),
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
    }
    setLoading(null);
    setActionModal(null);
    setActionNotes('');
  }

  async function createManualBooking() {
    setManualError(null);
    if (!manualForm.bike_id || !manualForm.customer_name || !manualForm.customer_phone || !manualForm.start_ts || !manualForm.end_ts) {
      setManualError('All fields are required');
      return;
    }
    setManualLoading(true);
    const res = await fetch('/api/admin/bookings/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bike_id: manualForm.bike_id,
        customer_name: manualForm.customer_name,
        customer_phone: manualForm.customer_phone,
        start_ts: new Date(manualForm.start_ts).toISOString(),
        end_ts: new Date(manualForm.end_ts).toISOString(),
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
                        {(() => { const c = customerInfo(b); return (
                          <>
                            <div className="font-medium flex items-center gap-1.5">
                              {c.name}
                              {b.source === 'manual' && (
                                <span className="text-[9px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">Manual</span>
                              )}
                            </div>
                            {c.email && <div className="text-xs text-muted">{c.email}</div>}
                            {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
                          </>
                        ); })()}
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
                            <button onClick={() => setActionModal({ id: b.id, action: 'ongoing' })} disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100 transition-colors disabled:opacity-50">
                              Mark Pickup
                            </button>
                          )}
                          {b.status === 'ongoing' && (
                            <button onClick={() => setActionModal({ id: b.id, action: 'completed' })} disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors disabled:opacity-50">
                              Mark Return
                            </button>
                          )}
                          {['confirmed', 'ongoing', 'pending_payment'].includes(b.status) && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'cancelled' }); setActionNotes(''); }}
                              className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                              Cancel
                            </button>
                          )}
                          {b.status === 'cancelled' && b.payment_status === 'paid' && (
                            <button onClick={() => setActionModal({ id: b.id, action: 'refunded' })}
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
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
            <div className="flex justify-end gap-3">
              <button onClick={() => setActionModal(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button onClick={() => updateStatus(actionModal.id, actionModal.action, actionNotes)}
                className={`px-4 py-2 text-sm text-white rounded-lg ${actionModal.action === 'cancelled' ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'}`}>
                Confirm
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Customer name <span className="text-danger">*</span></label>
                <input value={manualForm.customer_name} onChange={e => setManualForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="input-field w-full" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone <span className="text-danger">*</span></label>
                <input value={manualForm.customer_phone} onChange={e => setManualForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="input-field w-full" placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Pickup <span className="text-danger">*</span></label>
                <input type="datetime-local" value={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, start_ts: e.target.value }))}
                  className="input-field w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Drop-off <span className="text-danger">*</span></label>
                <input type="datetime-local" value={manualForm.end_ts} min={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, end_ts: e.target.value }))}
                  className="input-field w-full text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Notes</label>
              <input value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full" placeholder="Optional notes" />
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
