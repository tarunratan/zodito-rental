'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { OnlineBookingDetailModal } from './OnlineBookingDetailModal';
import { istLocalToUtcIso, utcToIstLocal, formatIstDateTime } from '@/lib/datetime';

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
  km_limit: number;
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
  alternate_phone?: string | null;
  advance_paid?: number;
  pending_amount?: number;
  odometer_reading?: number | null;
  helmets_provided?: number;
  original_dl_taken?: boolean;
  payment_method_detail?: string | null;
  payment_proof_url?: string | null;
  booking_lat?: number | null;
  booking_lng?: number | null;
  booking_ip?: string | null;
  kyc_dl_front_url?: string | null;
  kyc_dl_back_url?: string | null;
  kyc_aadhaar_front_url?: string | null;
  kyc_aadhaar_back_url?: string | null;
  kyc_selfie_url?: string | null;
  handover_saved_at?: string | null;
  handover_saved_by?: string | null;
  user_id?: string | null;
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  bike: {
    id: string;
    registration_number: string | null;
    color: string | null;
    emoji: string;
    image_url?: string | null;
    extra_km_rate?: number | null;
    late_penalty_hour?: number | null;
    model: {
      display_name: string;
      category?: string | null;
      cc?: number | null;
      excess_km_rate?: number | null;
      late_hourly_penalty?: number | null;
    } | null;
  } | null;
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
  partially_paid: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-blue-100 text-blue-700',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return formatIstDateTime(ts);
}

function rupee(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function BookingKycDocs({ booking }: { booking: Booking }) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadUrls() {
    if (urls !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/kyc-urls?booking_id=${booking.id}`);
      if (res.ok) setUrls(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const DOC_LABELS: Record<string, string> = {
    dl_front: 'DL Front', dl_back: 'DL Back',
    aadhaar_front: 'Aadhaar Front', aadhaar_back: 'Aadhaar Back',
    selfie: 'Selfie',
  };

  // Count from loaded urls if available; else from booking-level paths (manual bookings)
  const countLabel = urls !== null
    ? `${Object.keys(urls).length}/5`
    : booking.user_id
    ? '…'
    : `${[booking.kyc_dl_front_url, booking.kyc_dl_back_url, booking.kyc_aadhaar_front_url, booking.kyc_aadhaar_back_url, booking.kyc_selfie_url].filter(Boolean).length}/5`;

  return (
    <div className="rounded-xl border-2 border-blue-200 overflow-hidden mt-4">
      <div className="px-4 py-2 bg-blue-50 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-blue-700">🪪 KYC Documents — {countLabel}</span>
        {urls === null && (
          <button
            onClick={loadUrls}
            disabled={loading}
            className="text-[11px] text-blue-600 font-semibold hover:underline disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'View documents →'}
          </button>
        )}
      </div>
      {urls && Object.keys(urls).length === 0 && (
        <div className="p-3 bg-white text-xs text-muted italic">No KYC documents submitted yet.</div>
      )}
      {urls && Object.keys(urls).length > 0 && (
        <div className="p-3 bg-white flex flex-wrap gap-3">
          {Object.entries(DOC_LABELS).map(([key, label]) => {
            const signedUrl = urls[key];
            return (
              <div key={key} className="text-center">
                <p className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</p>
                {signedUrl ? (
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signedUrl} alt={label} className="w-24 h-24 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <div className="w-24 h-24 rounded-lg border border-dashed border-border bg-bg flex items-center justify-center text-2xl">—</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

export function BookingsManager({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  // Sub-tab view filter — replaces the old chunky status-chip strip.
  // 'all' is global search across every bucket; rest are focused buckets.
  const [view, setView] = useState<'all' | 'active' | 'overdue' | 'upcoming' | 'past'>('all');
  // Source filter, orthogonal to view — admins frequently want to scope to
  // walk-in (manual) bookings only when reconciling cash.
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [search, setSearch] = useState('');
  const [actionModal, setActionModal] = useState<{ id: string; action: string } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{ id: string; number: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  async function deleteBooking(booking_id: string) {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/admin/bookings/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id }),
      });
      if (res.ok) {
        setBookings(prev => prev.filter(b => b.id !== booking_id));
        setDeleteModal(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? 'Failed to delete booking');
      }
    } catch {
      setDeleteError('Network error — please try again');
    } finally {
      setDeleteLoading(false);
    }
  }

  const [extendModal, setExtendModal] = useState<{ id: string; number: string; currentEnd: string; pendingAmount: number; kmLimit: number } | null>(null);
  // Drop-off as date + hour (no minutes). Combined to an ISO string only when
  // firing the extend POST. Mirrors the customer ExtendBookingPanel so admin
  // and customer flows share the same "6 AM – 10 PM, hour-only" UX.
  const [extendNewDate, setExtendNewDate] = useState('');
  const [extendNewHour, setExtendNewHour] = useState<number>(10);
  const extendNewEnd = extendNewDate
    ? `${extendNewDate}T${String(extendNewHour).padStart(2, '0')}:00`
    : '';
  const [extendAmtCollected, setExtendAmtCollected] = useState('');
  const [extendExtraKm, setExtendExtraKm] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  async function extendBooking() {
    if (!extendModal || !extendNewEnd) return;
    const newEndIso = istLocalToUtcIso(extendNewEnd);
    if (!newEndIso || new Date(newEndIso) <= new Date(extendModal.currentEnd)) {
      setExtendError('New end time must be after current end time');
      return;
    }
    setExtendLoading(true);
    setExtendError(null);
    try {
      const body: any = { booking_id: extendModal.id, new_end_ts: newEndIso };
      if (extendAmtCollected) body.amount_collected = parseFloat(extendAmtCollected);
      if (extendExtraKm) body.extra_km = parseInt(extendExtraKm, 10);

      const res = await fetch('/api/admin/bookings/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBookings(prev => prev.map(b => {
          if (b.id !== extendModal.id) return b;
          const upd = { ...b, end_ts: newEndIso };
          if (data.updates?.km_limit != null) upd.km_limit = data.updates.km_limit;
          if (data.updates?.advance_paid != null) upd.advance_paid = data.updates.advance_paid;
          if (data.updates?.pending_amount != null) upd.pending_amount = data.updates.pending_amount;
          if (data.updates?.payment_status) upd.payment_status = data.updates.payment_status;
          return upd;
        }));
        setExtendModal(null);
        setExtendNewDate('');
        setExtendNewHour(10);
        setExtendAmtCollected('');
        setExtendExtraKm('');
      } else {
        setExtendError(data.error ?? 'Failed to extend booking');
      }
    } catch {
      setExtendError('Network error — please try again');
    } finally {
      setExtendLoading(false);
    }
  }

  // Detail modal for ALL bookings (online + offline)
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  const now = new Date();

  // Sub-tab semantics — what each view holds:
  //   active   : ongoing and still inside the rental window (return imminent)
  //   overdue  : ongoing past end_ts (needs settlement) OR confirmed past start_ts (no-show / awaiting pickup)
  //   upcoming : confirmed-future + pending_payment (not yet started)
  //   past     : completed + cancelled + payment_failed (history)
  function isPickupOverdue(b: Booking) {
    return b.status === 'confirmed' && new Date(b.start_ts) <= now;
  }
  function isReturnOverdue(b: Booking) {
    return b.status === 'ongoing' && new Date(b.end_ts) < now;
  }
  function bucketOf(b: Booking): 'active' | 'overdue' | 'upcoming' | 'past' {
    if (b.status === 'ongoing')   return isReturnOverdue(b) ? 'overdue' : 'active';
    if (b.status === 'confirmed') return isPickupOverdue(b) ? 'overdue' : 'upcoming';
    if (b.status === 'pending_payment') return 'upcoming';
    return 'past'; // completed / cancelled / payment_failed
  }

  const counts = bookings.reduce<Record<string, number>>((acc, b) => {
    const k = bucketOf(b);
    acc[k] = (acc[k] ?? 0) + 1;
    if (sourceFilter === 'all' || (sourceFilter === 'offline' ? b.source === 'manual' : b.source !== 'manual')) {
      acc[`${k}_visible`] = (acc[`${k}_visible`] ?? 0) + 1;
    }
    return acc;
  }, { active: 0, overdue: 0, upcoming: 0, past: 0 });

  const filtered = bookings.filter(b => {
    if (view !== 'all' && bucketOf(b) !== view) return false;
    if (sourceFilter === 'online'  && b.source === 'manual') return false;
    if (sourceFilter === 'offline' && b.source !== 'manual') return false;
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

  async function updateStatus(booking_id: string, action: string, notes?: string) {
    // no_show is a UI alias for cancellation with a pre-filled reason
    const status = action === 'no_show' ? 'cancelled' : action;
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


  // Visible bucket counts factor in the source filter so the tab badges
  // match what the user is actually filtering to.
  const visibleCounts = {
    active:   counts.active_visible   ?? counts.active   ?? 0,
    overdue:  counts.overdue_visible  ?? counts.overdue  ?? 0,
    upcoming: counts.upcoming_visible ?? counts.upcoming ?? 0,
    past:     counts.past_visible     ?? counts.past     ?? 0,
  };
  const totalVisible = visibleCounts.active + visibleCounts.overdue + visibleCounts.upcoming + visibleCounts.past;
  const VIEWS = [
    { key: 'all'      as const, label: 'All',      badge: totalVisible           },
    { key: 'active'   as const, label: 'Active',   badge: visibleCounts.active   },
    { key: 'overdue'  as const, label: 'Overdue',  badge: visibleCounts.overdue,  urgent: visibleCounts.overdue > 0 },
    { key: 'upcoming' as const, label: 'Upcoming', badge: visibleCounts.upcoming },
    { key: 'past'     as const, label: 'Past',     badge: visibleCounts.past     },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-lg">Bookings</h2>
        <div className="flex items-center gap-2">
          {visibleCounts.overdue > 0 && (
            <Link href="/admin/bookings/overdue" className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-semibold inline-flex items-center gap-1.5">
              ⏰ {visibleCounts.overdue} overdue · Settle →
            </Link>
          )}
          <Link href="/admin/bookings/new" className="text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/90 font-medium">
            + Manual Booking
          </Link>
        </div>
      </div>

      {/* Daily/weekly/monthly summary strip — quick "what do I need to do
          today" surface. Computed from the already-loaded bookings, no
          extra fetch. */}
      <SummaryStrip bookings={bookings} />

      {/* Sub-tabs — replaces the old status-chip row. Active/Overdue/Upcoming/Past
          group the same statuses but by what an admin actually does with them. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {VIEWS.map(v => {
          const isActive = view === v.key;
          const urgent = (v as any).urgent;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${
                isActive
                  ? urgent ? 'bg-red-600 text-white' : 'bg-accent text-white'
                  : urgent ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' : 'bg-border/60 text-muted hover:bg-border'
              }`}
            >
              {urgent && '⚠ '}{v.label}
              {v.badge > 0 && (
                <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20' : 'bg-muted/20'}`}>
                  {v.badge}
                </span>
              )}
            </button>
          );
        })}
        {/* Source filter — orthogonal to view, lets admin focus on cash/walk-in
            books (offline) vs. Razorpay (online). */}
        <div className="ml-auto inline-flex rounded-lg overflow-hidden border border-border text-[10px] font-bold">
          {(['all', 'online', 'offline'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
                sourceFilter === s ? 'bg-primary text-white' : 'bg-bg text-muted hover:bg-border/60'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
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
                    <tr
                      key={b.id}
                      className="border-b border-border hover:bg-bg/40 cursor-pointer transition-colors"
                      onClick={() => setDetailBooking(b)}
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
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-md bg-border/40 flex items-center justify-center shrink-0 overflow-hidden">
                            {b.bike?.image_url
                              ? <img src={b.bike.image_url} alt="" className="w-full h-full object-cover" />
                              : <span className="text-lg">{b.bike?.emoji ?? '🏍️'}</span>
                            }
                          </div>
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
                          {b.payment_status.replace(/_/g, ' ')}
                        </span>
                        {(b.pending_amount ?? 0) > 0 && (
                          <div className="text-[10px] text-orange-600 font-semibold mt-0.5">
                            ₹{Number(b.pending_amount).toLocaleString('en-IN')} pending
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPickupOverdue(b) ? (
                          <div className="space-y-0.5">
                            <span className="block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                              Awaiting Pickup
                            </span>
                            {(() => {
                              const minsElapsed = Math.floor((now.getTime() - new Date(b.start_ts).getTime()) / 60000);
                              const minsLeft = 120 - minsElapsed;
                              return minsLeft > 0
                                ? <span className="block text-[10px] text-orange-500 px-2">bike free in ~{minsLeft}m</span>
                                : <span className="block text-[10px] text-red-500 px-2 font-semibold">bike now visible on site</span>;
                            })()}
                          </div>
                        ) : (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? ''}`}>
                            {b.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <RowActions
                          booking={b}
                          loading={loading === b.id}
                          isPickupOverdue={isPickupOverdue(b)}
                          isReturnOverdue={isReturnOverdue(b)}
                          onPrimary={(action) => {
                            if (action === 'details')  { setDetailBooking(b); return; }
                            if (action === 'delete')   { setDeleteModal({ id: b.id, number: b.booking_number }); setDeleteError(null); return; }
                            if (action === 'settle')   { setDetailBooking(b); return; } // SettlementComposer surfaces inside the modal
                            if (action === 'extend')   {
                              const istLocal = utcToIstLocal(b.end_ts);
                              const date = istLocal.slice(0, 10);
                              const curHour = parseInt(istLocal.slice(11, 13), 10) || 10;
                              setExtendModal({ id: b.id, number: b.booking_number, currentEnd: b.end_ts, pendingAmount: b.pending_amount ?? 0, kmLimit: b.km_limit });
                              setExtendNewDate(date);
                              setExtendNewHour(Math.min(22, Math.max(6, curHour)));
                              setExtendAmtCollected('');
                              setExtendExtraKm('');
                              setExtendError(null);
                              return;
                            }
                            // Status-transition actions all route through the same confirm modal.
                            const presetNotes = action === 'no_show'
                              ? (b.status === 'ongoing' ? 'Force cancelled by admin' : 'Customer no-show — bike released')
                              : '';
                            setActionModal({ id: b.id, action });
                            setActionNotes(presetNotes);
                            setActionError(null);
                          }}
                        />
                      </td>
                    </tr>
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
               actionModal.action === 'no_show' ? 'Mark as No-show?' :
               actionModal.action === 'cancelled' ? 'Cancel Booking?' : 'Process Refund?'}
            </h3>
            {actionModal.action === 'no_show' && (
              <p className="text-xs text-muted">This will cancel the booking and free the bike immediately.</p>
            )}
            {['cancelled', 'completed', 'no_show'].includes(actionModal.action) && (
              <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                className="input-field w-full h-20 resize-none"
                placeholder={actionModal.action === 'completed' ? 'Return notes (optional)' : 'Cancellation reason'} />
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
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-60 ${['cancelled', 'no_show'].includes(actionModal.action) ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'}`}
              >
                {loading === actionModal.id ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-red-600">Delete Booking?</h3>
            <p className="text-sm text-muted">
              Permanently delete <span className="font-mono font-semibold text-primary">{deleteModal.number}</span>?
              This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteModal(null); setDeleteError(null); }}
                className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2"
              >
                Keep it
              </button>
              <button
                onClick={() => deleteBooking(deleteModal.id)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-60"
              >
                {deleteLoading ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend booking modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Extend Booking {extendModal.number}</h3>
            <div>
              <p className="text-xs text-muted mb-1">Current end time</p>
              <p className="text-sm font-medium">{fmt(extendModal.currentEnd)}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">New drop-off date &amp; hour <span className="text-danger">*</span></label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={extendNewDate}
                  min={utcToIstLocal(extendModal.currentEnd).slice(0, 10)}
                  onChange={e => setExtendNewDate(e.target.value)}
                  className="input-field flex-1 text-sm"
                />
                <select
                  value={extendNewHour}
                  onChange={e => setExtendNewHour(parseInt(e.target.value, 10))}
                  className="input-field text-sm w-32"
                >
                  {Array.from({ length: 17 }, (_, i) => 6 + i).map(h => {
                    const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : h === 24 ? '12 AM' : `${h - 12} PM`;
                    return <option key={h} value={h}>{label}</option>;
                  })}
                </select>
              </div>
              <p className="text-[10px] text-muted mt-1">Drop-offs accepted 6 AM – 10 PM. Hour-only — no minutes.</p>
              {extendNewEnd && new Date(extendNewEnd) > new Date(extendModal.currentEnd) && (
                <p className="text-[11px] text-purple-600 mt-1">
                  +{Math.round((new Date(extendNewEnd).getTime() - new Date(extendModal.currentEnd).getTime()) / 3_600_000)} hrs extension
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Amount collected (₹)</label>
                <input
                  type="number" min={0} step={1}
                  value={extendAmtCollected}
                  onChange={e => setExtendAmtCollected(e.target.value)}
                  placeholder="0"
                  className="input-field w-full text-sm"
                />
                {extendModal.pendingAmount > 0 && (
                  <p className="text-[10px] text-orange-600 mt-0.5">Pending: {rupee(extendModal.pendingAmount)}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">Extra KMs added</label>
                <input
                  type="number" min={0} step={10}
                  value={extendExtraKm}
                  onChange={e => setExtendExtraKm(e.target.value)}
                  placeholder="0"
                  className="input-field w-full text-sm"
                />
                <p className="text-[10px] text-muted mt-0.5">Current: {extendModal.kmLimit} km</p>
              </div>
            </div>
            {extendError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{extendError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setExtendModal(null); setExtendError(null); }} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">
                Cancel
              </button>
              <button
                onClick={extendBooking}
                disabled={extendLoading}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60"
              >
                {extendLoading ? 'Extending…' : 'Extend Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Online booking detail modal */}
      <OnlineBookingDetailModal
        booking={detailBooking}
        onClose={() => setDetailBooking(null)}
        onSaved={(updates) => {
          if (!detailBooking) return;
          const next = { ...detailBooking, ...updates } as Booking;
          setDetailBooking(next);
          setBookings(prev => prev.map(x => x.id === detailBooking.id ? next : x));
        }}
        onActioned={(next) => {
          if (!detailBooking) return;
          const nowIso = new Date().toISOString();
          const merged: Booking = { ...detailBooking };
          if (next.status === 'ongoing') { merged.status = 'ongoing'; merged.picked_up_at = nowIso; }
          if (next.status === 'completed') { merged.status = 'completed'; merged.returned_at = nowIso; }
          if (next.status === 'cancelled') { merged.status = 'cancelled'; merged.cancelled_at = nowIso; if (next.cancellation_reason !== undefined) merged.cancellation_reason = next.cancellation_reason; }
          if (next.status === 'confirmed') { merged.status = 'confirmed'; }
          if (next.payment_status) merged.payment_status = next.payment_status;
          setDetailBooking(merged);
          setBookings(prev => prev.map(x => x.id === detailBooking.id ? merged : x));
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RowActions — one state-appropriate primary action + a kebab menu of
// everything else. The primary picks itself based on what an admin most
// likely wants to do next given the booking's current state; the kebab
// keeps everything reachable without crowding the table.
// ─────────────────────────────────────────────────────────────────────────────
type RowAction =
  | 'details' | 'ongoing' | 'completed' | 'cancelled' | 'no_show'
  | 'refunded' | 'extend' | 'settle' | 'delete';

function RowActions({
  booking,
  loading,
  isPickupOverdue,
  isReturnOverdue,
  onPrimary,
}: {
  booking: Booking;
  loading: boolean;
  isPickupOverdue: boolean;
  isReturnOverdue: boolean;
  onPrimary: (action: RowAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close — needed since the dropdown isn't a real <select>.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Decide the primary action — one per state, picked for "what comes next."
  // Settle wins over Mark Return when the ride is past its drop-off, because
  // the money question takes priority over the operational one.
  let primary: { action: RowAction; label: string; className: string } | null = null;
  if (booking.status === 'ongoing' && isReturnOverdue) {
    primary = { action: 'settle', label: '💸 Settle', className: 'bg-red-600 text-white hover:bg-red-700' };
  } else if (booking.status === 'ongoing') {
    primary = { action: 'completed', label: '✓ Mark Return', className: 'bg-green-600 text-white hover:bg-green-700' };
  } else if (booking.status === 'confirmed' && isPickupOverdue) {
    primary = { action: 'ongoing', label: '🏁 Mark Pickup', className: 'bg-orange-500 text-white hover:bg-orange-600' };
  } else if (booking.status === 'confirmed' || booking.status === 'pending_payment') {
    primary = { action: 'details', label: 'View', className: 'bg-accent/10 text-accent hover:bg-accent/20' };
  } else if (booking.status === 'cancelled' && booking.payment_status === 'paid') {
    primary = { action: 'refunded', label: '↩ Refund', className: 'bg-blue-50 text-blue-700 hover:bg-blue-100' };
  } else {
    primary = { action: 'details', label: 'View', className: 'bg-border text-primary hover:bg-border/70' };
  }

  // Build the secondary actions menu. Order matches the operator's mental
  // model: details first (always-on), then state-conditional ops, finally
  // destructive at the bottom.
  const items: { action: RowAction; label: string; danger?: boolean }[] = [];
  if (primary.action !== 'details') items.push({ action: 'details', label: 'Open details' });
  if (['confirmed', 'ongoing'].includes(booking.status)) items.push({ action: 'extend', label: 'Extend (admin)' });
  if (booking.status === 'ongoing' && isReturnOverdue) items.push({ action: 'completed', label: 'Mark return' });
  // No-show is a pickup decision — only meaningful while the booking is still
  // 'confirmed' (whether future or past start_ts). Once 'ongoing', the customer
  // already picked up so they can't no-show.
  if (booking.status === 'confirmed') items.push({ action: 'no_show', label: 'Mark no-show', danger: true });
  if (['confirmed', 'pending_payment'].includes(booking.status)) items.push({ action: 'cancelled', label: 'Cancel booking', danger: true });
  if (booking.status === 'cancelled' && booking.payment_status === 'paid' && primary.action !== 'refunded') {
    items.push({ action: 'refunded', label: 'Mark refunded' });
  }
  if (['cancelled', 'payment_failed'].includes(booking.status)) items.push({ action: 'delete', label: 'Delete booking', danger: true });

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={() => onPrimary(primary!.action)}
        disabled={loading}
        className={`text-xs px-2.5 py-1 rounded font-semibold disabled:opacity-50 transition-colors ${primary.className}`}
      >
        {primary.label}
      </button>
      {items.length > 0 && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            disabled={loading}
            aria-label="More actions"
            className="text-base px-1.5 py-0.5 rounded hover:bg-border/60 leading-none"
          >
            ⋮
          </button>
          {open && (
            <div className="absolute right-0 mt-1 min-w-[160px] bg-white border border-border rounded-lg shadow-lg overflow-hidden z-20 text-xs">
              {items.map(it => (
                <button
                  key={it.action}
                  onClick={() => { setOpen(false); onPrimary(it.action); }}
                  className={`w-full text-left px-3 py-2 hover:bg-bg/60 ${it.danger ? 'text-red-600' : 'text-primary'}`}
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryStrip — five compact cards above the sub-tabs showing the
// operator's "what do I need to do" at a glance.
//
// All metrics are computed from the bookings array already loaded by the
// page (200 most recent). For a small/medium tenant this covers daily and
// weekly fine, and is close enough for monthly. If you outgrow that, swap
// in a dedicated aggregation endpoint — the component interface stays the
// same.
// ─────────────────────────────────────────────────────────────────────────────
function SummaryStrip({ bookings }: { bookings: Booking[] }) {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');

  // IST-aware boundary math. Operator thinks in IST; if we compute boundaries
  // in UTC, a 2 AM pickup looks like "yesterday" on the dashboard. Use the
  // local Date object — Vercel + browsers both honour the user's TZ for new
  // Date() comparisons.
  const now = new Date();
  let from = new Date(now);
  let to   = new Date(now);
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (range === 'week') {
    // Mon → Sun. JS Sunday = 0; shift so Monday is the start.
    const day = (now.getDay() + 6) % 7;
    from.setDate(now.getDate() - day);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };

  // Pickups, returns, revenue, dues — scoped to the chosen range.
  // Overdue is always "right now" since it's an actionable count, not a
  // historical metric.
  const nowMs = now.getTime();
  const pickupsInRange  = bookings.filter(b => inRange(b.start_ts) && b.status !== 'cancelled' && b.status !== 'payment_failed').length;
  const returnsInRange  = bookings.filter(b => inRange(b.end_ts)   && b.status !== 'cancelled' && b.status !== 'payment_failed').length;
  const overdueNow      = bookings.filter(b =>
    (b.status === 'ongoing'   && new Date(b.end_ts).getTime()   < nowMs) ||
    (b.status === 'confirmed' && new Date(b.start_ts).getTime() < nowMs)
  ).length;
  const revenueInRange  = bookings
    .filter(b => inRange(b.start_ts) && b.status !== 'cancelled' && b.status !== 'payment_failed')
    .reduce((sum, b) => sum + Number(b.advance_paid ?? 0), 0);
  const duesInRange     = bookings
    .filter(b => inRange(b.end_ts) && (b.pending_amount ?? 0) > 0 && b.status !== 'cancelled')
    .reduce((sum, b) => sum + Number(b.pending_amount ?? 0), 0);

  const rangeLabel = range === 'today' ? 'today' : range === 'week' ? 'this week' : 'this month';

  return (
    <div className="rounded-xl border border-border bg-white p-3 mb-3">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Snapshot</p>
        <div className="inline-flex rounded-lg overflow-hidden border border-border text-[10px] font-bold">
          {(['today', 'week', 'month'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
                range === r ? 'bg-accent text-white' : 'bg-bg text-muted hover:bg-border/60'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card label="Pickups"        value={String(pickupsInRange)}                                       sub={rangeLabel} />
        <Card label="Returns due"    value={String(returnsInRange)}                                       sub={rangeLabel} />
        <Card label="Overdue now"    value={String(overdueNow)}                                           sub="needs action" urgent={overdueNow > 0} />
        <Card label="Revenue"        value={`₹${Math.round(revenueInRange).toLocaleString('en-IN')}`}     sub={`paid ${rangeLabel}`} />
        <Card label="Dues"           value={`₹${Math.round(duesInRange).toLocaleString('en-IN')}`}        sub={`pending ${rangeLabel}`} accent={duesInRange > 0} />
      </div>
    </div>
  );
}

function Card({ label, value, sub, urgent, accent }: { label: string; value: string; sub?: string; urgent?: boolean; accent?: boolean }) {
  const valueClass = urgent ? 'text-red-700' : accent ? 'text-orange-600' : 'text-primary';
  const borderClass = urgent ? 'border-red-200 bg-red-50/30' : 'border-border bg-bg/30';
  return (
    <div className={`rounded-lg border ${borderClass} px-3 py-2`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display font-bold text-lg leading-tight mt-0.5 ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
