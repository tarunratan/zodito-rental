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
  user_id?: string | null;
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  bike: { id: string; registration_number: string | null; color: string | null; emoji: string; image_url?: string | null; model: { display_name: string } | null } | null;
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
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
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

type BikeOption = { id: string; emoji: string; registration_number: string | null; model: { display_name: string } | null };

type ManualTab = 'customer' | 'kyc' | 'trip' | 'payment' | 'handover';

const MANUAL_TABS: { key: ManualTab; label: string; icon: string }[] = [
  { key: 'customer', label: 'Customer',  icon: '👤' },
  { key: 'kyc',      label: 'KYC Docs',  icon: '🪪' },
  { key: 'trip',     label: 'Trip',      icon: '🏍️' },
  { key: 'payment',  label: 'Payment',   icon: '💰' },
  { key: 'handover', label: 'Handover',  icon: '✅' },
];

const EMPTY_MANUAL = {
  bike_id: '', customer_name: '', customer_phone: '', customer_email: '',
  alternate_phone: '',
  start_ts: '', end_ts: '',
  total_amount: '', advance_paid: '', security_deposit: '', km_limit: '',
  odometer_reading: '',
  payment_method_detail: '' as '' | 'cash' | 'upi' | 'online' | 'partial_online',
  payment_proof_url: '',
  helmets_provided: '0',
  original_dl_taken: false,
  notes: '',
  kyc_dl_front_url:      '',
  kyc_dl_back_url:       '',
  kyc_aadhaar_front_url: '',
  kyc_aadhaar_back_url:  '',
  kyc_selfie_url:        '',
};

export function BookingsManager({ initialBookings, allBikes = [] }: { initialBookings: Booking[]; allBikes?: BikeOption[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; action: string } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{ id: string; number: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Handover inline editing (works for all booking types)
  const [handoverEdit, setHandoverEdit] = useState<Record<string, any>>({});
  const [handoverSaving, setHandoverSaving] = useState<string | null>(null);
  const [handoverSaved, setHandoverSaved] = useState<string | null>(null);

  function initHandover(b: Booking) {
    setHandoverEdit(prev => ({
      ...prev,
      [b.id]: {
        alternate_phone: b.alternate_phone ?? '',
        odometer_reading: b.odometer_reading ?? '',
        helmets_provided: b.helmets_provided ?? 0,
        original_dl_taken: b.original_dl_taken ?? false,
        notes: b.notes ?? '',
        pending_amount: b.pending_amount ?? 0,
      },
    }));
  }

  async function saveHandover(bookingId: string) {
    const h = handoverEdit[bookingId];
    if (!h) return;
    setHandoverSaving(bookingId);
    try {
      const res = await fetch('/api/admin/bookings/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          alternate_phone: h.alternate_phone || null,
          odometer_reading: h.odometer_reading !== '' ? Number(h.odometer_reading) : null,
          helmets_provided: Number(h.helmets_provided) || 0,
          original_dl_taken: !!h.original_dl_taken,
          notes: h.notes || null,
          pending_amount: Number(h.pending_amount) || 0,
        }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
          ...b,
          alternate_phone: h.alternate_phone || null,
          odometer_reading: h.odometer_reading !== '' ? Number(h.odometer_reading) : null,
          helmets_provided: Number(h.helmets_provided) || 0,
          original_dl_taken: !!h.original_dl_taken,
          notes: h.notes || null,
          pending_amount: Number(h.pending_amount) || 0,
        }));
        setHandoverSaved(bookingId);
        setTimeout(() => setHandoverSaved(null), 2500);
      }
    } finally {
      setHandoverSaving(null);
    }
  }

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
  const [extendNewEnd, setExtendNewEnd] = useState('');
  const [extendAmtCollected, setExtendAmtCollected] = useState('');
  const [extendExtraKm, setExtendExtraKm] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  async function extendBooking() {
    if (!extendModal || !extendNewEnd) return;
    if (new Date(extendNewEnd) <= new Date(extendModal.currentEnd)) {
      setExtendError('New end time must be after current end time');
      return;
    }
    setExtendLoading(true);
    setExtendError(null);
    try {
      const body: any = { booking_id: extendModal.id, new_end_ts: new Date(extendNewEnd).toISOString() };
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
          const upd = { ...b, end_ts: new Date(extendNewEnd).toISOString() };
          if (data.updates?.km_limit != null) upd.km_limit = data.updates.km_limit;
          if (data.updates?.advance_paid != null) upd.advance_paid = data.updates.advance_paid;
          if (data.updates?.pending_amount != null) upd.pending_amount = data.updates.pending_amount;
          if (data.updates?.payment_status) upd.payment_status = data.updates.payment_status;
          return upd;
        }));
        setExtendModal(null);
        setExtendNewEnd('');
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

  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ ...EMPTY_MANUAL });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualTab, setManualTab] = useState<ManualTab>('customer');
  const [kycUploading, setKycUploading] = useState<Record<string, boolean>>({});

  async function uploadKycDoc(file: File, docType: string) {
    setKycUploading(p => ({ ...p, [docType]: true }));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    try {
      const res = await fetch('/api/admin/bookings/kyc-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.path) {
        setManualForm(f => ({ ...f, [`kyc_${docType}_url`]: data.path }));
      } else {
        setManualError(data.error ?? 'Upload failed');
      }
    } catch {
      setManualError('Network error during upload');
    } finally {
      setKycUploading(p => ({ ...p, [docType]: false }));
    }
  }

  // KYC docs count for tab badge
  const kycCount = ['kyc_dl_front_url','kyc_dl_back_url','kyc_aadhaar_front_url','kyc_aadhaar_back_url','kyc_selfie_url']
    .filter(k => (manualForm as any)[k]).length;

  const allStatuses = ['all', 'awaiting_pickup', 'confirmed', 'ongoing', 'pending_payment', 'completed', 'cancelled', 'payment_failed'];

  const now = new Date();

  const counts = allStatuses.reduce<Record<string, number>>((acc, s) => {
    if (s === 'all') { acc[s] = bookings.length; return acc; }
    if (s === 'awaiting_pickup') {
      acc[s] = bookings.filter(b => b.status === 'confirmed' && new Date(b.start_ts) <= now).length;
      return acc;
    }
    if (s === 'confirmed') {
      acc[s] = bookings.filter(b => b.status === 'confirmed' && new Date(b.start_ts) > now).length;
      return acc;
    }
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {});

  function isOverdue(b: Booking) {
    return b.status === 'confirmed' && new Date(b.start_ts) <= now;
  }

  function matchesFilter(b: Booking) {
    if (filter === 'all') return true;
    if (filter === 'awaiting_pickup') return isOverdue(b);
    if (filter === 'confirmed') return b.status === 'confirmed' && !isOverdue(b);
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

  async function createManualBooking() {
    setManualError(null);
    if (!manualForm.bike_id || !manualForm.customer_name.trim() || !manualForm.customer_phone.trim() || !manualForm.start_ts || !manualForm.end_ts) {
      setManualError('Bike, customer name, phone, and dates are all required');
      return;
    }
    const totalAmt   = manualForm.total_amount   ? parseFloat(manualForm.total_amount)   : 0;
    const advanceAmt = manualForm.advance_paid    ? parseFloat(manualForm.advance_paid)   : 0;
    if (advanceAmt > totalAmt) {
      setManualError('Advance paid cannot exceed total amount');
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
        alternate_phone: manualForm.alternate_phone.trim() || undefined,
        start_ts: new Date(manualForm.start_ts).toISOString(),
        end_ts: new Date(manualForm.end_ts).toISOString(),
        total_amount: totalAmt,
        advance_paid: advanceAmt,
        security_deposit: manualForm.security_deposit ? parseFloat(manualForm.security_deposit) : 0,
        km_limit: manualForm.km_limit ? parseInt(manualForm.km_limit) : 0,
        odometer_reading: manualForm.odometer_reading ? parseInt(manualForm.odometer_reading) : undefined,
        helmets_provided: parseInt(manualForm.helmets_provided) || 0,
        original_dl_taken: manualForm.original_dl_taken,
        payment_method_detail: manualForm.payment_method_detail || undefined,
        payment_proof_url: manualForm.payment_proof_url.trim() || undefined,
        kyc_dl_front_url:      manualForm.kyc_dl_front_url      || undefined,
        kyc_dl_back_url:       manualForm.kyc_dl_back_url       || undefined,
        kyc_aadhaar_front_url: manualForm.kyc_aadhaar_front_url || undefined,
        kyc_aadhaar_back_url:  manualForm.kyc_aadhaar_back_url  || undefined,
        kyc_selfie_url:        manualForm.kyc_selfie_url        || undefined,
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
        <button onClick={() => { setShowManual(true); setManualForm({ ...EMPTY_MANUAL }); setManualError(null); setManualTab('customer'); }}
          className="text-sm px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/90 font-medium">
          + Manual Booking
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {allStatuses.filter(s => s !== 'payment_failed').map(s => {
          const label = s === 'awaiting_pickup' ? 'Awaiting Pickup' : s.replace(/_/g, ' ');
          const isUrgent = s === 'awaiting_pickup' && counts[s] > 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${
                filter === s
                  ? isUrgent ? 'bg-orange-500 text-white' : 'bg-accent text-white'
                  : isUrgent ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-border/60 text-muted hover:bg-border'
              }`}
            >
              {isUrgent && '⚠ '}{label}
              {counts[s] > 0 && (
                <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${filter === s ? 'bg-white/20' : 'bg-muted/20'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          );
        })}
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
                        {isOverdue(b) ? (
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          {b.status === 'confirmed' && (
                            <button onClick={() => { setActionModal({ id: b.id, action: 'ongoing' }); setActionError(null); }} disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100 transition-colors disabled:opacity-50">
                              Mark Pickup
                            </button>
                          )}
                          {['confirmed', 'ongoing'].includes(b.status) && (
                            <button
                              onClick={() => {
                                const localEnd = new Date(b.end_ts);
                                const pad = (n: number) => n.toString().padStart(2, '0');
                                const localStr = `${localEnd.getFullYear()}-${pad(localEnd.getMonth()+1)}-${pad(localEnd.getDate())}T${pad(localEnd.getHours())}:${pad(localEnd.getMinutes())}`;
                                setExtendModal({ id: b.id, number: b.booking_number, currentEnd: b.end_ts, pendingAmount: b.pending_amount ?? 0, kmLimit: b.km_limit });
                                setExtendNewEnd(localStr);
                                setExtendAmtCollected('');
                                setExtendExtraKm('');
                                setExtendError(null);
                              }}
                              disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors disabled:opacity-50"
                            >
                              Extend
                            </button>
                          )}
                          {isOverdue(b) && (
                            <button
                              onClick={() => {
                                setActionModal({ id: b.id, action: 'no_show' });
                                setActionNotes('Customer no-show — bike released');
                                setActionError(null);
                              }}
                              disabled={loading === b.id}
                              className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              No-show
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
                          {['cancelled', 'payment_failed'].includes(b.status) && (
                            <button
                              onClick={() => { setDeleteModal({ id: b.id, number: b.booking_number }); setDeleteError(null); }}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                          <button onClick={() => {
                            if (expanded !== b.id) initHandover(b);
                            setExpanded(e => e === b.id ? null : b.id);
                          }}
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
                              {b.gst_amount > 0 && <p>GST: {rupee(b.gst_amount)}</p>}
                              <p>Deposit: {rupee(b.security_deposit)}</p>
                              {b.excess_km_charge > 0 && <p>Excess KM: {rupee(b.excess_km_charge)}</p>}
                              {b.damage_charge > 0 && <p>Damage: {rupee(b.damage_charge)}</p>}
                              <p className="font-semibold mt-1">Total: {rupee(b.total_amount)}</p>
                              {(b.advance_paid ?? 0) > 0 && (
                                <p className="text-green-700 text-xs">Paid: {rupee(b.advance_paid ?? 0)}</p>
                              )}
                              {(b.pending_amount ?? 0) > 0 && (
                                <p className="text-orange-600 font-semibold text-xs">Pending: {rupee(b.pending_amount ?? 0)}</p>
                              )}
                              {b.payment_method_detail && (
                                <p className="text-xs text-muted capitalize mt-0.5">via {b.payment_method_detail.replace(/_/g, ' ')}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Timeline</p>
                              {b.picked_up_at && <p className="text-xs">Picked up: {fmt(b.picked_up_at)}</p>}
                              {b.returned_at && <p className="text-xs">Returned: {fmt(b.returned_at)}</p>}
                              {b.cancelled_at && <p className="text-xs text-red-500">Cancelled: {fmt(b.cancelled_at)}</p>}
                              {b.final_km_used != null && <p className="text-xs">KM used: {b.final_km_used}</p>}
                              {b.odometer_reading != null && <p className="text-xs">Odometer: {b.odometer_reading} km</p>}
                              {b.km_limit > 0 && <p className="text-xs">KM limit: {b.km_limit} km</p>}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Handover</p>
                              {b.razorpay_payment_id && <p className="text-xs font-mono text-muted">{b.razorpay_payment_id}</p>}
                              <p className="text-xs capitalize">{b.payment_status.replace(/_/g, ' ')}</p>
                              {(b.helmets_provided ?? 0) > 0 && <p className="text-xs">Helmets: {b.helmets_provided}</p>}
                              <p className="text-xs">{b.original_dl_taken ? '✅ DL taken' : '— DL not taken'}</p>
                              {b.alternate_phone && <p className="text-xs text-muted">Alt ph: {b.alternate_phone}</p>}
                            </div>
                            <div>
                              {(b.notes || b.cancellation_reason) && (
                                <>
                                  <p className="text-xs font-semibold text-muted uppercase mb-1">Notes</p>
                                  <p className="text-xs text-muted">{b.notes || b.cancellation_reason}</p>
                                </>
                              )}
                              {b.payment_proof_url && (
                                <div className="mt-2">
                                  <p className="text-xs font-semibold text-muted uppercase mb-1">Payment Proof</p>
                                  <a
                                    href={b.payment_proof_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-accent underline"
                                  >
                                    View proof →
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── KYC Documents — show for manual (booking-level docs) and online (user profile docs) ── */}
                          {(b.kyc_dl_front_url || b.kyc_dl_back_url || b.kyc_aadhaar_front_url || b.kyc_aadhaar_back_url || b.kyc_selfie_url || b.user?.id) && (
                            <BookingKycDocs booking={b} />
                          )}

                          {/* ── Editable Handover ── */}
                          {handoverEdit[b.id] && (
                            <div className="rounded-xl border-2 border-green-200 overflow-hidden mt-4">
                              <div className="px-4 py-2 bg-green-50 flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wide text-green-700">✅ Handover Details</span>
                                {handoverSaved === b.id && (
                                  <span className="text-[11px] text-green-600 font-semibold">Saved ✓</span>
                                )}
                              </div>
                              <div className="p-4 bg-white space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Alternate Phone</label>
                                    <input
                                      type="tel"
                                      value={handoverEdit[b.id].alternate_phone}
                                      onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], alternate_phone: e.target.value } }))}
                                      className="input-field w-full text-sm"
                                      placeholder="+91 98765 43210"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Odometer at Pickup (km)</label>
                                    <input
                                      type="number" min={0}
                                      value={handoverEdit[b.id].odometer_reading}
                                      onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], odometer_reading: e.target.value } }))}
                                      className="input-field w-full text-sm"
                                      placeholder="e.g. 12540"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Helmets Provided</label>
                                    <input
                                      type="number" min={0} max={5}
                                      value={handoverEdit[b.id].helmets_provided}
                                      onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], helmets_provided: e.target.value } }))}
                                      className="input-field w-full text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Amount Pending (₹)</label>
                                    <input
                                      type="number" min={0} step={1}
                                      value={handoverEdit[b.id].pending_amount}
                                      onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], pending_amount: e.target.value } }))}
                                      className="input-field w-full text-sm"
                                    />
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!handoverEdit[b.id].original_dl_taken}
                                    onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], original_dl_taken: e.target.checked } }))}
                                    className="w-4 h-4 accent-accent"
                                  />
                                  <span className="text-sm font-medium">Original DL taken</span>
                                </label>
                                <div>
                                  <label className="text-[10px] text-muted uppercase tracking-wide block mb-0.5">Remarks / Notes</label>
                                  <textarea
                                    value={handoverEdit[b.id].notes}
                                    onChange={e => setHandoverEdit(p => ({ ...p, [b.id]: { ...p[b.id], notes: e.target.value } }))}
                                    className="input-field w-full h-16 resize-none text-sm"
                                    placeholder="Any notes…"
                                  />
                                </div>
                                <button
                                  onClick={() => saveHandover(b.id)}
                                  disabled={handoverSaving === b.id}
                                  className="btn-accent text-sm py-2 w-full disabled:opacity-60"
                                >
                                  {handoverSaving === b.id ? 'Saving…' : 'Save Handover Details'}
                                </button>
                              </div>
                            </div>
                          )}

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
               actionModal.action === 'no_show' ? 'Mark as No-show?' :
               actionModal.action === 'cancelled' ? 'Cancel Booking?' : 'Process Refund?'}
            </h3>
            {actionModal.action === 'no_show' && (
              <p className="text-xs text-muted">Customer did not show up for pickup. This will cancel the booking and free the bike.</p>
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
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1">New drop-off time <span className="text-danger">*</span></label>
              <input
                type="datetime-local"
                value={extendNewEnd}
                min={new Date(extendModal.currentEnd).toISOString().slice(0, 16)}
                onChange={e => setExtendNewEnd(e.target.value)}
                className="input-field w-full"
              />
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

      {/* Manual booking modal — tabbed */}
      {showManual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-xl my-4 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold text-lg">Manual / Offline Booking</h3>
              <button onClick={() => setShowManual(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border shrink-0 overflow-x-auto">
              {MANUAL_TABS.map(tab => {
                const isKyc = tab.key === 'kyc';
                const active = manualTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setManualTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                      active
                        ? 'border-accent text-accent'
                        : 'border-transparent text-muted hover:text-primary hover:border-border'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                    {isKyc && kycCount > 0 && (
                      <span className="ml-0.5 text-[9px] bg-green-500 text-white rounded-full px-1.5 py-0.5 font-bold">{kycCount}/5</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">

              {/* ── Customer tab ── */}
              {manualTab === 'customer' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Customer Details</p>
                  <input value={manualForm.customer_name} onChange={e => setManualForm(f => ({ ...f, customer_name: e.target.value }))}
                    className="input-field w-full" placeholder="Full name *" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Primary phone *</label>
                      <input value={manualForm.customer_phone} onChange={e => setManualForm(f => ({ ...f, customer_phone: e.target.value }))}
                        className="input-field w-full" placeholder="+91 98765 43210" type="tel" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Alternate phone</label>
                      <input value={manualForm.alternate_phone} onChange={e => setManualForm(f => ({ ...f, alternate_phone: e.target.value }))}
                        className="input-field w-full" placeholder="Optional" type="tel" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted block mb-0.5">Email</label>
                    <input value={manualForm.customer_email} onChange={e => setManualForm(f => ({ ...f, customer_email: e.target.value }))}
                      className="input-field w-full" placeholder="Optional" type="email" />
                  </div>
                  <button onClick={() => setManualTab('kyc')}
                    className="w-full mt-2 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
                    Next: KYC Docs →
                  </button>
                </div>
              )}

              {/* ── KYC Docs tab ── */}
              {manualTab === 'kyc' && (
                <div className="space-y-4">
                  <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">KYC Documents</p>
                  <p className="text-xs text-muted -mt-1">All fields optional — upload what you have. Files go directly to secure storage.</p>

                  {/* DL */}
                  <div>
                    <p className="text-xs font-semibold text-primary mb-2">Driving Licence</p>
                    <div className="grid grid-cols-2 gap-3">
                      <DocSlot
                        label="Front"
                        docType="dl_front"
                        value={manualForm.kyc_dl_front_url}
                        uploading={!!kycUploading['dl_front']}
                        onUpload={f => uploadKycDoc(f, 'dl_front')}
                        onClear={() => setManualForm(p => ({ ...p, kyc_dl_front_url: '' }))}
                      />
                      <DocSlot
                        label="Back"
                        docType="dl_back"
                        value={manualForm.kyc_dl_back_url}
                        uploading={!!kycUploading['dl_back']}
                        onUpload={f => uploadKycDoc(f, 'dl_back')}
                        onClear={() => setManualForm(p => ({ ...p, kyc_dl_back_url: '' }))}
                      />
                    </div>
                  </div>

                  {/* Aadhaar */}
                  <div>
                    <p className="text-xs font-semibold text-primary mb-2">Aadhaar Card</p>
                    <div className="grid grid-cols-2 gap-3">
                      <DocSlot
                        label="Front"
                        docType="aadhaar_front"
                        value={manualForm.kyc_aadhaar_front_url}
                        uploading={!!kycUploading['aadhaar_front']}
                        onUpload={f => uploadKycDoc(f, 'aadhaar_front')}
                        onClear={() => setManualForm(p => ({ ...p, kyc_aadhaar_front_url: '' }))}
                      />
                      <DocSlot
                        label="Back"
                        docType="aadhaar_back"
                        value={manualForm.kyc_aadhaar_back_url}
                        uploading={!!kycUploading['aadhaar_back']}
                        onUpload={f => uploadKycDoc(f, 'aadhaar_back')}
                        onClear={() => setManualForm(p => ({ ...p, kyc_aadhaar_back_url: '' }))}
                      />
                    </div>
                  </div>

                  {/* Selfie */}
                  <div>
                    <p className="text-xs font-semibold text-primary mb-2">Selfie with Document</p>
                    <div className="max-w-[50%]">
                      <DocSlot
                        label="Selfie"
                        docType="selfie"
                        value={manualForm.kyc_selfie_url}
                        uploading={!!kycUploading['selfie']}
                        onUpload={f => uploadKycDoc(f, 'selfie')}
                        onClear={() => setManualForm(p => ({ ...p, kyc_selfie_url: '' }))}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setManualTab('customer')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                    <button onClick={() => setManualTab('trip')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Trip →</button>
                  </div>
                </div>
              )}

              {/* ── Trip tab ── */}
              {manualTab === 'trip' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Trip Details</p>
                  <div>
                    <label className="text-[11px] text-muted block mb-0.5">Bike *</label>
                    <select value={manualForm.bike_id} onChange={e => setManualForm(f => ({ ...f, bike_id: e.target.value }))} className="input-field w-full">
                      <option value="">Select a bike…</option>
                      {allBikes.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.emoji} {b.model?.display_name ?? 'Unknown'}{b.registration_number ? ` · ${b.registration_number}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Pickup date & time *</label>
                      <input type="datetime-local" value={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, start_ts: e.target.value }))}
                        className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Drop-off date & time *</label>
                      <input type="datetime-local" value={manualForm.end_ts} min={manualForm.start_ts} onChange={e => setManualForm(f => ({ ...f, end_ts: e.target.value }))}
                        className="input-field w-full text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">KM limit</label>
                      <input value={manualForm.km_limit} onChange={e => setManualForm(f => ({ ...f, km_limit: e.target.value }))}
                        className="input-field w-full" placeholder="e.g. 200" type="number" min="0" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Odometer at pickup (km)</label>
                      <input value={manualForm.odometer_reading} onChange={e => setManualForm(f => ({ ...f, odometer_reading: e.target.value }))}
                        className="input-field w-full" placeholder="e.g. 12540" type="number" min="0" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setManualTab('kyc')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                    <button onClick={() => setManualTab('payment')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Payment →</button>
                  </div>
                </div>
              )}

              {/* ── Payment tab ── */}
              {manualTab === 'payment' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Financials</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Total Amount (₹)</label>
                      <input value={manualForm.total_amount} onChange={e => setManualForm(f => ({ ...f, total_amount: e.target.value }))}
                        className="input-field w-full" placeholder="0" type="number" min="0" step="1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Advance Paid (₹)</label>
                      <input value={manualForm.advance_paid} onChange={e => setManualForm(f => ({ ...f, advance_paid: e.target.value }))}
                        className="input-field w-full" placeholder="0" type="number" min="0" step="1" />
                      <p className="text-[10px] text-muted mt-0.5">0 if not yet collected</p>
                    </div>
                  </div>
                  {manualForm.total_amount && manualForm.advance_paid && (
                    <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-700">
                      Pending at pickup: <span className="font-bold">₹{Math.max(0, parseFloat(manualForm.total_amount || '0') - parseFloat(manualForm.advance_paid || '0')).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Security Deposit (₹)</label>
                      <input value={manualForm.security_deposit} onChange={e => setManualForm(f => ({ ...f, security_deposit: e.target.value }))}
                        className="input-field w-full" placeholder="500" type="number" min="0" step="1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Payment Method</label>
                      <select value={manualForm.payment_method_detail} onChange={e => setManualForm(f => ({ ...f, payment_method_detail: e.target.value as any }))}
                        className="input-field w-full text-sm">
                        <option value="">— select —</option>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="online">Online (Razorpay)</option>
                        <option value="partial_online">Partial (online + cash)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted block mb-0.5">Payment Proof URL</label>
                    <input value={manualForm.payment_proof_url} onChange={e => setManualForm(f => ({ ...f, payment_proof_url: e.target.value }))}
                      className="input-field w-full" placeholder="https://…" type="url" />
                    <p className="text-[10px] text-muted mt-0.5">Paste a link to a screenshot or receipt</p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setManualTab('trip')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                    <button onClick={() => setManualTab('handover')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Handover →</button>
                  </div>
                </div>
              )}

              {/* ── Handover tab ── */}
              {manualTab === 'handover' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Handover Checklist</p>
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <label className="text-[11px] text-muted block mb-0.5">Helmets Provided</label>
                      <input value={manualForm.helmets_provided} onChange={e => setManualForm(f => ({ ...f, helmets_provided: e.target.value }))}
                        className="input-field w-full" placeholder="0" type="number" min="0" max="5" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none pb-1">
                      <input type="checkbox" checked={manualForm.original_dl_taken}
                        onChange={e => setManualForm(f => ({ ...f, original_dl_taken: e.target.checked }))}
                        className="w-4 h-4 accent-accent" />
                      <span className="text-sm font-medium">Original DL taken</span>
                    </label>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted block mb-0.5">Remarks / Notes</label>
                    <textarea value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                      className="input-field w-full h-20 resize-none" placeholder="Any internal notes about this booking…" />
                  </div>

                  {/* Summary strip */}
                  <div className="rounded-lg border border-border bg-bg p-3 space-y-1 text-xs">
                    <p className="font-semibold text-[11px] uppercase tracking-wide text-muted mb-2">Booking Summary</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted">Customer</span>
                      <span className="font-medium">{manualForm.customer_name || '—'}</span>
                      <span className="text-muted">Phone</span>
                      <span className="font-medium">{manualForm.customer_phone || '—'}</span>
                      <span className="text-muted">Pickup</span>
                      <span className="font-medium">{manualForm.start_ts ? new Date(manualForm.start_ts).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : '—'}</span>
                      <span className="text-muted">Drop-off</span>
                      <span className="font-medium">{manualForm.end_ts ? new Date(manualForm.end_ts).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : '—'}</span>
                      <span className="text-muted">Total</span>
                      <span className="font-medium">₹{parseFloat(manualForm.total_amount||'0').toLocaleString('en-IN')}</span>
                      <span className="text-muted">KYC docs</span>
                      <span className={`font-medium ${kycCount > 0 ? 'text-green-600' : 'text-orange-500'}`}>{kycCount}/5 uploaded</span>
                    </div>
                  </div>

                  <button onClick={() => setManualTab('payment')} className="w-full py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                </div>
              )}

              {manualError && <p className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">{manualError}</p>}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-border shrink-0">
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

// ── DocSlot: file upload slot for KYC docs in manual booking form ─────────────
function DocSlot({
  label, value, uploading, onUpload, onClear,
}: {
  label: string;
  docType: string;
  value: string;
  uploading: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-bg/50 p-3 flex flex-col items-center gap-2 text-center min-h-[96px] justify-center transition-colors hover:border-accent/40">
      {uploading ? (
        <div className="space-y-1">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] text-muted">Uploading…</p>
        </div>
      ) : value ? (
        <div className="space-y-1.5 w-full">
          <div className="text-green-500 text-xl leading-none">✓</div>
          <p className="text-[10px] font-semibold text-green-700">{label} — saved</p>
          <button type="button" onClick={onClear} className="text-[10px] text-red-400 hover:text-red-600 underline">Remove</button>
        </div>
      ) : (
        <label className="cursor-pointer w-full block">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
          />
          <div className="space-y-1 pointer-events-none">
            <div className="text-2xl">📷</div>
            <p className="text-[10px] font-semibold text-muted">{label}</p>
            <p className="text-[10px] text-accent">Tap to upload</p>
          </div>
        </label>
      )}
    </div>
  );
}
