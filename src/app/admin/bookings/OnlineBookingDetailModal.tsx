'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatIstDateTime } from '@/lib/datetime';

type DetailBooking = {
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
  handover_saved_at?: string | null;
  handover_saved_by?: string | null;
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

type HandoverLog = {
  id: string;
  kind: 'save' | 'confirm' | 'start' | 'complete' | 'cancel' | 'refund';
  admin_name: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const LOG_LABELS: Record<HandoverLog['kind'], string> = {
  save:     'Updated handover details',
  confirm:  'Confirmed booking',
  start:    'Started ride',
  complete: 'Completed ride',
  cancel:   'Cancelled booking',
  refund:   'Marked refunded',
};

type DetailTab = 'customer' | 'kyc' | 'trip' | 'payment' | 'handover';

const TABS: { key: DetailTab; label: string; icon: string }[] = [
  { key: 'customer', label: 'Customer', icon: '👤' },
  { key: 'kyc',      label: 'KYC Docs', icon: '🪪' },
  { key: 'trip',     label: 'Trip',     icon: '🏍️' },
  { key: 'payment',  label: 'Payment',  icon: '💰' },
  { key: 'handover', label: 'Handover', icon: '✅' },
];

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

const DOC_LABELS: Record<string, string> = {
  dl_front: 'DL Front',
  dl_back: 'DL Back',
  aadhaar_front: 'Aadhaar Front',
  aadhaar_back: 'Aadhaar Back',
  selfie: 'Selfie',
};

function fmtDateTime(ts: string | null) {
  if (!ts) return '—';
  return formatIstDateTime(ts);
}

function fmtDateTime12(ts: string | null) {
  if (!ts) return '—';
  return formatIstDateTime(ts);
}

function rupee(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function customerName(b: DetailBooking) {
  if (b.user?.first_name || b.user?.last_name) {
    return [b.user.first_name, b.user.last_name].filter(Boolean).join(' ');
  }
  return b.customer_name?.trim() || '—';
}

function durationLabel(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return '—';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return rem === 0 ? `${days} day${days === 1 ? '' : 's'}` : `${days}d ${rem}h`;
}

export function OnlineBookingDetailModal({
  booking,
  onClose,
  onSaved,
  onActioned,
}: {
  booking: DetailBooking | null;
  onClose: () => void;
  onSaved: (updates: Partial<DetailBooking>) => void;
  onActioned: (next: { status?: string; payment_status?: string; cancellation_reason?: string | null }) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('customer');

  type EditState = {
    alternate_phone: string;
    odometer_reading: string | number;
    helmets_provided: number;
    original_dl_taken: boolean;
    notes: string;
    pending_amount: number;
    security_deposit: number;
    payment_method_detail: '' | 'cash' | 'upi' | 'online' | 'partial_online';
  };

  const [edit, setEdit] = useState<EditState>({
    alternate_phone: '',
    odometer_reading: '',
    helmets_provided: 0,
    original_dl_taken: false,
    notes: '',
    pending_amount: 0,
    security_deposit: 0,
    payment_method_detail: '',
  });
  // Snapshot of the values that were last successfully saved — used to compute
  // `isDirty` so the "Mark Pickup" button can require a fresh save before it
  // becomes clickable. Critical to the save→verify→start workflow.
  const [baseline, setBaseline] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [kycUrls, setKycUrls] = useState<Record<string, string> | null>(null);
  const [kycLoading, setKycLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; reasonRequired: boolean; label: string } | null>(null);
  const [reasonText, setReasonText] = useState('');

  // Top-level view/edit toggle. Whenever the booking has already been saved
  // (handover_saved_at is set — either by an admin save on online bookings
  // or auto-stamped at manual-booking creation), reopening goes straight to
  // the Order Confirmation summary instead of the editable forms. The admin
  // can flip to edit mode via the EDIT BOOKING button.
  const [editMode, setEditMode] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const [logs, setLogs] = useState<HandoverLog[] | null>(null);
  const [extensions, setExtensions] = useState<Array<{
    id: string; status: string; original_end_ts: string; new_end_ts: string;
    extra_hours: number; extra_km: number; new_km_limit: number; total_delta: number;
    matched_tier: string | null; paid_at: string | null; created_at: string;
  }> | null>(null);

  // Reset state when booking changes
  useEffect(() => {
    if (!booking) return;
    setTab('customer');
    setKycUrls(null);
    setSaveError(null);
    setSavedOk(false);
    setActionError(null);
    setConfirmAction(null);
    setReasonText('');
    setLogs(null);
    setEditMode(false); // reopen → always default to the saved-confirmation view
    setCopyToast(false);
    const initial: EditState = {
      alternate_phone: booking.alternate_phone ?? '',
      odometer_reading: booking.odometer_reading ?? '',
      helmets_provided: booking.helmets_provided ?? 0,
      original_dl_taken: !!booking.original_dl_taken,
      notes: booking.notes ?? '',
      pending_amount: booking.pending_amount ?? 0,
      security_deposit: booking.security_deposit ?? 0,
      payment_method_detail: (booking.payment_method_detail as any) ?? '',
    };
    setEdit(initial);
    // Treat the freshly-loaded values as the baseline so isDirty starts false.
    setBaseline(initial);
  }, [booking]);

  // Pull audit log when either the Handover edit tab is opened OR the summary
  // view is showing — both render the activity timeline.
  useEffect(() => {
    if (!booking || logs !== null) return;
    const inSummary = !!booking.handover_saved_at && !editMode;
    if (tab !== 'handover' && !inSummary) return;
    let abort = false;
    fetch(`/api/admin/bookings/handover-logs?booking_id=${booking.id}`)
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(d => { if (!abort) setLogs(d.logs ?? []); })
      .catch(() => { if (!abort) setLogs([]); });
    return () => { abort = true; };
  }, [booking, tab, logs, editMode]);

  // Pull extension history once when the Trip tab opens — also small.
  useEffect(() => {
    if (!booking || tab !== 'trip' || extensions !== null) return;
    let abort = false;
    fetch(`/api/bookings/${booking.id}/extensions`)
      .then(r => r.ok ? r.json() : { extensions: [] })
      .then(d => { if (!abort) setExtensions(d.extensions ?? []); })
      .catch(() => { if (!abort) setExtensions([]); });
    return () => { abort = true; };
  }, [booking, tab, extensions]);

  // Load KYC signed URLs eagerly whenever the booking is already saved (the
  // Order Confirmation view embeds them) OR when the admin lands on the KYC
  // tab in edit mode. The single fetch covers both surfaces.
  useEffect(() => {
    if (!booking || kycUrls !== null) return;
    const isSavedSummary = !!booking.handover_saved_at && !editMode;
    if (tab !== 'kyc' && !isSavedSummary) return;
    let abort = false;
    setKycLoading(true);
    fetch(`/api/admin/bookings/kyc-urls?booking_id=${booking.id}`)
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(data => { if (!abort) setKycUrls(data ?? {}); })
      .catch(() => { if (!abort) setKycUrls({}); })
      .finally(() => { if (!abort) setKycLoading(false); });
    return () => { abort = true; };
  }, [booking, tab, kycUrls, editMode]);

  const kycCount = useMemo(() => {
    if (!kycUrls) return null;
    return Object.values(kycUrls).filter(Boolean).length;
  }, [kycUrls]);

  if (!booking) return null;

  async function save(fieldsToSend: Record<string, unknown>) {
    if (!booking) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/bookings/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, ...fieldsToSend }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save');
        return false;
      }
      onSaved({ ...(fieldsToSend as Partial<DetailBooking>), handover_saved_at: data.saved_at ?? undefined, handover_saved_by: data.saved_by ?? undefined });
      // Update the baseline so subsequent edits are detected as dirty.
      setBaseline(edit);
      setSavedOk(true);
      setLogs(null);  // force refresh — next render in summary mode will refetch
      // After a successful save, drop the admin back to the Order Confirmation
      // view (covers both first-time save and edits via the EDIT BOOKING button).
      setEditMode(false);
      setTimeout(() => setSavedOk(false), 2200);
      return true;
    } catch {
      setSaveError('Network error — please try again');
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Required for ride-start. Mirrors the server-side gate in /update.
  function pickupValidationErrors(): string[] {
    const out: string[] = [];
    if (edit.odometer_reading === '' || edit.odometer_reading == null) {
      out.push('Odometer at pickup is required.');
    }
    if (Number(edit.odometer_reading) < 0) {
      out.push('Odometer cannot be negative.');
    }
    return out;
  }

  const isDirty = baseline ? JSON.stringify(edit) !== JSON.stringify(baseline) : false;
  const everSaved = !!booking?.handover_saved_at;
  const pickupErrors = pickupValidationErrors();
  const canMarkPickup = booking?.status === 'confirmed' && everSaved && !isDirty && pickupErrors.length === 0;

  async function runStatusAction(action: string, notes?: string) {
    if (!booking) return;
    const status = action === 'no_show' ? 'cancelled' : action;
    setActionLoading(action);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/bookings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, status, reason: notes || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? `Failed (${res.status})`);
        return;
      }
      const next: any = {};
      if (status === 'ongoing') next.status = 'ongoing';
      else if (status === 'completed') next.status = 'completed';
      else if (status === 'cancelled') { next.status = 'cancelled'; if (notes) next.cancellation_reason = notes; }
      else if (status === 'refunded') next.payment_status = 'refunded';
      onActioned(next);
      setConfirmAction(null);
      setReasonText('');
      setLogs(null); // force log refresh on next open
    } catch {
      setActionError('Network error — please try again');
    } finally {
      setActionLoading(null);
    }
  }

  const isManual = booking.source === 'manual';
  const customer = customerName(booking);
  const phone = booking.user?.phone ?? booking.customer_phone ?? '';
  const email = booking.user?.email ?? '';
  // Top-level mode: a saved booking re-opens straight into the Order
  // Confirmation summary (admin clicks EDIT to go back to forms).
  const showSummary = everSaved && !editMode;

  // Build the customer-facing booking summary text used by Copy & WhatsApp.
  function buildSummaryText(): string {
    const bikeName    = booking!.bike?.model?.display_name ?? '—';
    const bikeDetails = [
      booking!.bike?.registration_number,
      booking!.bike?.color,
      booking!.bike?.model?.cc ? `${booking!.bike.model.cc}cc` : null,
    ].filter(Boolean).join(' · ') || '—';
    const paid    = Number(booking!.advance_paid ?? booking!.total_amount ?? 0);
    const pending = Number(edit.pending_amount ?? booking!.pending_amount ?? 0);
    const odo     = edit.odometer_reading !== '' && edit.odometer_reading != null
                      ? String(edit.odometer_reading)
                      : (booking!.odometer_reading != null ? String(booking!.odometer_reading) : '—');
    const helmets = String(edit.helmets_provided ?? booking!.helmets_provided ?? 0).padStart(2, '0');
    const dl      = (edit.original_dl_taken ?? booking!.original_dl_taken) ? 'Yes' : 'No';
    const deposit = Number(edit.security_deposit || booking!.security_deposit || 0);
    const statusLabel = booking!.status.replace(/_/g, ' ').toUpperCase();
    const extraKmRate     = Number(booking!.bike?.extra_km_rate ?? booking!.bike?.model?.excess_km_rate ?? 3);
    const latePenaltyRate = Number(booking!.bike?.late_penalty_hour ?? booking!.bike?.model?.late_hourly_penalty ?? 49);
    const isScooter       = booking!.bike?.model?.category === 'scooter';
    const altPhone = edit.alternate_phone || booking!.alternate_phone || '—';
    const remarks  = (edit.notes || booking!.notes || '').trim() || '—';

    return [
      `BOOKING DETAILS : ${statusLabel}`,
      `Customer Name : ${customer}`,
      `Alternate Phn no. : ${altPhone}`,
      `Bike Booked : ${bikeName}`,
      `Bike Details : ${bikeDetails}`,
      `Pickup D&T : ${fmtDateTime12(booking!.start_ts)}`,
      `Drop D&T : ${fmtDateTime12(booking!.end_ts)}`,
      `Amount Paid : ${rupee(paid)}`,
      `Amount Pending : ${rupee(pending)}`,
      `Odometer Reading : ${odo}`,
      `Kms limit : ${booking!.km_limit} km`,
      `Security deposit : ${rupee(deposit)}`,
      `Helmets Provided : ${helmets}`,
      `Original DL taken : ${dl}`,
      `Fuel Level : —`,
      `Handover Remarks : ${remarks}`,
      '',
      `${isScooter ? 'Scooty' : 'Bike'}: ₹${extraKmRate} per extra km / ₹${latePenaltyRate} per hour for late penalty.`,
      `🕛 Hub timings 6:00am - 10:30pm.`,
      `Please note: Bike drop-offs are not accepted after 10:30 PM. An overnight rental fee will apply, and bikes must be returned after 6:00am.`,
      `# The booking amount for the bike is non-refundable once confirmed. #`,
      `Have a great and safe Ride 🤝`,
      `Thank you for Choosing Zoditorentals ❤️😊`,
    ].join('\n');
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildSummaryText());
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2200);
    } catch {
      // Fallback for older browsers / non-secure contexts: drop a textarea
      const ta = document.createElement('textarea');
      ta.value = buildSummaryText();
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopyToast(true); setTimeout(() => setCopyToast(false), 2200); } catch {}
      document.body.removeChild(ta);
    }
  }

  function openWhatsApp() {
    const raw = phone || edit.alternate_phone || booking!.alternate_phone || '';
    // Strip everything that isn't a digit; keep last 10–13 digits as the number.
    const digits = String(raw).replace(/\D+/g, '');
    const target = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(buildSummaryText())}`
                          : `https://wa.me/?text=${encodeURIComponent(buildSummaryText())}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-2xl my-4 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate">Booking <span className="font-mono text-accent">{booking.booking_number}</span></h3>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_COLORS[booking.status] ?? 'bg-border'}`}>
                {booking.status.replace(/_/g, ' ')}
              </span>
              {!isManual && (
                <span className="text-[9px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Online</span>
              )}
              {isManual && (
                <span className="text-[9px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">Offline</span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-0.5">Created {fmtDateTime(booking.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg shrink-0">✕</button>
        </div>

        {/* Tab bar — hidden in summary mode; the Order Confirmation view replaces it. */}
        {!showSummary && (
          <div className="flex border-b border-border shrink-0 overflow-x-auto">
            {TABS.map(t => {
              const active = tab === t.key;
              const isKyc = t.key === 'kyc';
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-primary hover:border-border'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                  {isKyc && kycCount !== null && (
                    <span className={`ml-0.5 text-[9px] rounded-full px-1.5 py-0.5 font-bold ${kycCount > 0 ? 'bg-green-500 text-white' : 'bg-border text-muted'}`}>
                      {kycCount}/5
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {/* ── SUMMARY MODE: saved → show Order Confirmation + action toolbar ── */}
          {showSummary && (
            <OrderConfirmationCard
              booking={booking}
              edit={edit}
              kycUrls={kycUrls}
              kycLoading={kycLoading}
              onEdit={() => setEditMode(true)}
              onCopy={copySummary}
              onWhatsApp={openWhatsApp}
              copyToast={copyToast}
              actionLoading={actionLoading}
              canMarkPickup={canMarkPickup}
              everSaved={everSaved}
              isDirty={isDirty}
              pickupErrors={pickupErrors}
              onAction={(a, reasonReq, label) => setConfirmAction({ action: a, reasonRequired: reasonReq, label })}
              logs={logs}
            />
          )}

          {/* ── EDIT MODE: original tabbed forms ── */}
          {!showSummary && (
          <>
          {/* Customer */}
          {tab === 'customer' && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Customer Details</p>

              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Customer Full Name</label>
                  <input value={customer} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Primary Phone</label>
                  <input value={phone} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed" placeholder="—" />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Alternate Phone</label>
                  <input
                    value={edit.alternate_phone}
                    onChange={e => setEdit(p => ({ ...p, alternate_phone: e.target.value }))}
                    className="input-field w-full"
                    placeholder="+91 98765 43210"
                    type="tel"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted block mb-0.5">Email</label>
                <input value={email} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed" placeholder="—" />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => save({ alternate_phone: edit.alternate_phone || null })}
                  disabled={saving}
                  className="flex-1 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Customer'}
                </button>
                <button onClick={() => setTab('kyc')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
                  Next: KYC Docs →
                </button>
              </div>
            </div>
          )}

          {/* KYC */}
          {tab === 'kyc' && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">KYC Documents</p>
              {kycLoading ? (
                <div className="py-10 text-center text-xs text-muted">Loading documents…</div>
              ) : kycUrls && Object.keys(kycUrls).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-bg/40 p-6 text-center text-xs text-muted">
                  No KYC documents submitted yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(DOC_LABELS).map(([key, label]) => {
                    const url = kycUrls?.[key];
                    return (
                      <div key={key} className={`rounded-lg border-2 ${url ? 'border-green-200 bg-green-50/30' : 'border-dashed border-border bg-bg/30'} p-2.5 flex flex-col items-center gap-1.5 text-center min-h-[140px] justify-between`}>
                        <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
                        {url ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={label} className="w-full h-20 object-cover rounded border border-border" />
                            <div className="flex items-center gap-1 text-[10px] text-green-700 font-semibold">
                              <span>✓</span><span>Verified</span>
                            </div>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent underline hover:no-underline">
                              View full image
                            </a>
                          </>
                        ) : (
                          <>
                            <div className="w-full h-20 rounded border border-dashed border-border flex items-center justify-center text-2xl text-muted/50">—</div>
                            <p className="text-[10px] text-muted">Not submitted</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="text-[11px] text-muted block mb-0.5">Verification Remarks</label>
                <textarea
                  value={edit.notes}
                  onChange={e => setEdit(p => ({ ...p, notes: e.target.value }))}
                  className="input-field w-full h-16 resize-none"
                  placeholder="Notes about KYC verification…"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button onClick={() => setTab('customer')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                <button
                  onClick={() => save({ notes: edit.notes || null })}
                  disabled={saving}
                  className="flex-1 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Remarks'}
                </button>
                <button onClick={() => setTab('trip')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Trip →</button>
              </div>
            </div>
          )}

          {/* Trip */}
          {tab === 'trip' && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Trip Details</p>

              {/* Bike preview card */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-16 h-16 rounded-lg bg-border/40 flex items-center justify-center shrink-0 overflow-hidden">
                    {booking.bike?.image_url
                      ? <img src={booking.bike.image_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-3xl">{booking.bike?.emoji ?? '🏍️'}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{booking.bike?.model?.display_name ?? '—'}</p>
                    <p className="text-xs text-muted font-mono">{booking.bike?.registration_number ?? '—'}</p>
                    <p className="text-[10px] text-muted capitalize">{booking.package_tier} · {durationLabel(booking.start_ts, booking.end_ts)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[booking.status] ?? 'bg-border'}`}>
                    {booking.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Pickup Date & Time</label>
                  <input value={fmtDateTime(booking.start_ts)} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed text-sm" />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Drop Date & Time</label>
                  <input value={fmtDateTime(booking.end_ts)} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">KM Limit</label>
                  <input value={booking.km_limit || ''} readOnly className="input-field w-full bg-bg/60 cursor-not-allowed" placeholder="—" />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Odometer at Pickup (km)</label>
                  <input
                    type="number"
                    min={0}
                    value={edit.odometer_reading}
                    onChange={e => setEdit(p => ({ ...p, odometer_reading: e.target.value }))}
                    className="input-field w-full"
                    placeholder="e.g. 12540"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button onClick={() => setTab('kyc')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                <button
                  onClick={() => save({
                    odometer_reading: edit.odometer_reading !== '' ? Number(edit.odometer_reading) : null,
                  })}
                  disabled={saving}
                  className="flex-1 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Trip'}
                </button>
                <button onClick={() => setTab('payment')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Payment →</button>
              </div>

              {/* Extension history — admin-visible audit of customer-initiated extensions */}
              {extensions !== null && extensions.length > 0 && (
                <div className="rounded-lg border border-border bg-white p-3 space-y-2 mt-2">
                  <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Booking Extensions</p>
                  <ul className="space-y-1.5">
                    {extensions.map(e => (
                      <li key={e.id} className="text-[11px] rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            e.status === 'confirmed' ? 'bg-green-100 text-green-700'
                            : e.status === 'failed' ? 'bg-red-100 text-red-700'
                            : e.status === 'expired' ? 'bg-gray-100 text-gray-500'
                            : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {e.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-muted">{fmtDateTime(e.created_at)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
                          <span className="text-muted">From → To</span>
                          <span>{fmtDateTime(e.original_end_ts)} → {fmtDateTime(e.new_end_ts)}</span>
                          <span className="text-muted">Extra KM / total</span>
                          <span>+{e.extra_km} km · total {e.new_km_limit}</span>
                          <span className="text-muted">Paid</span>
                          <span>{rupee(e.total_delta)}{e.matched_tier ? ` · ${e.matched_tier}` : ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Payment */}
          {tab === 'payment' && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Financials</p>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-bg/30 p-3 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Total</p>
                  <p className="font-bold text-base">{rupee(booking.total_amount)}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/40 p-3 text-center">
                  <p className="text-[10px] text-green-700 uppercase tracking-wide">Paid</p>
                  <p className="font-bold text-base text-green-700">{rupee(booking.advance_paid ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 text-center">
                  <p className="text-[10px] text-orange-700 uppercase tracking-wide">Pending</p>
                  <p className="font-bold text-base text-orange-700">{rupee(edit.pending_amount)}</p>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-muted">Online status:</span>
                <span className={`font-semibold px-2 py-0.5 rounded-full ${PAYMENT_COLORS[booking.payment_status] ?? 'bg-border'}`}>
                  {booking.payment_status.replace(/_/g, ' ')}
                </span>
                {booking.razorpay_payment_id && (
                  <span className="font-mono text-[10px] text-muted">{booking.razorpay_payment_id}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Amount Pending (₹)</label>
                  <input
                    type="number" min={0} step={1}
                    value={edit.pending_amount}
                    onChange={e => setEdit(p => ({ ...p, pending_amount: Number(e.target.value) || 0 }))}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Security Deposit (₹)</label>
                  <input
                    type="number" min={0} step={1}
                    value={edit.security_deposit}
                    onChange={e => setEdit(p => ({ ...p, security_deposit: Number(e.target.value) || 0 }))}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted block mb-0.5">Payment Method</label>
                <select
                  value={edit.payment_method_detail}
                  onChange={e => setEdit(p => ({ ...p, payment_method_detail: e.target.value as any }))}
                  className="input-field w-full text-sm"
                >
                  <option value="">— select —</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="online">Online (Razorpay)</option>
                  <option value="partial_online">Partial (online + cash)</option>
                </select>
              </div>

              {/* Transaction & proof */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-bg/30">
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Transaction</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">Transaction ID</span>
                  <span className="font-mono text-xs select-all">{booking.razorpay_payment_id ?? '—'}</span>
                </div>
                {booking.payment_proof_url && (
                  <div className="pt-1">
                    <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Payment Receipt / Screenshot</p>
                    {/^https?:\/\/.+\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(booking.payment_proof_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={booking.payment_proof_url} alt="proof" className="w-full max-h-40 object-contain rounded border border-border" />
                    ) : null}
                    <a href={booking.payment_proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
                      Open proof in new tab →
                    </a>
                  </div>
                )}
              </div>

              {/* Refund status */}
              {(booking.payment_status === 'refunded' || booking.status === 'cancelled') && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3 text-xs">
                  <p className="font-semibold text-blue-800">Refund</p>
                  <p className="text-blue-700 mt-1 capitalize">
                    Status: {booking.payment_status.replace(/_/g, ' ')}
                    {booking.cancellation_reason && <> · Reason: {booking.cancellation_reason}</>}
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button onClick={() => setTab('trip')} className="flex-1 py-2 text-sm text-muted border border-border rounded-lg hover:bg-border/50 transition-colors">← Back</button>
                <button
                  onClick={() => save({
                    pending_amount: Number(edit.pending_amount) || 0,
                    security_deposit: Number(edit.security_deposit) || 0,
                    payment_method_detail: edit.payment_method_detail || null,
                  })}
                  disabled={saving}
                  className="flex-1 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Payment'}
                </button>
                <button onClick={() => setTab('handover')} className="flex-1 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">Next: Handover →</button>
              </div>
            </div>
          )}

          {/* Handover — edit form. Saved bookings render the OrderConfirmationCard
              at the top of the modal body instead; this tab is the editable surface
              for first-time saves and EDIT BOOKING re-entries. */}
          {tab === 'handover' && (
            <div className="space-y-3">
              {everSaved && (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <span>Editing saved handover. Re-save to apply changes.</span>
                  <button
                    onClick={() => setEditMode(false)}
                    className="font-semibold underline hover:no-underline"
                  >
                    ← Back to confirmation
                  </button>
                </div>
              )}
              <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Handover Checklist</p>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="text-[11px] text-muted block mb-0.5">Helmets Provided</label>
                  <input
                    type="number" min={0} max={5}
                    value={edit.helmets_provided}
                    onChange={e => setEdit(p => ({ ...p, helmets_provided: Number(e.target.value) || 0 }))}
                    className="input-field w-full"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none pb-1">
                  <input
                    type="checkbox"
                    checked={edit.original_dl_taken}
                    onChange={e => setEdit(p => ({ ...p, original_dl_taken: e.target.checked }))}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm font-medium">Original DL taken</span>
                </label>
              </div>

              <div>
                <label className="text-[11px] text-muted block mb-0.5">Internal Remarks / Notes</label>
                <textarea
                  value={edit.notes}
                  onChange={e => setEdit(p => ({ ...p, notes: e.target.value }))}
                  className="input-field w-full h-20 resize-none"
                  placeholder="Any internal notes about this booking…"
                />
              </div>

              {/* Booking summary */}
              <div className="rounded-lg border border-border bg-bg p-3 space-y-1 text-xs">
                <p className="font-semibold text-[11px] uppercase tracking-wide text-muted mb-2">Booking Summary</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted">Customer</span>
                  <span className="font-medium">{customer}</span>
                  <span className="text-muted">Phone</span>
                  <span className="font-medium">{phone || '—'}</span>
                  <span className="text-muted">Bike</span>
                  <span className="font-medium">{booking.bike?.model?.display_name ?? '—'}</span>
                  <span className="text-muted">Pickup</span>
                  <span className="font-medium">{fmtDateTime(booking.start_ts)}</span>
                  <span className="text-muted">Drop-off</span>
                  <span className="font-medium">{fmtDateTime(booking.end_ts)}</span>
                  <span className="text-muted">Total</span>
                  <span className="font-medium">{rupee(booking.total_amount)}</span>
                  <span className="text-muted">Paid / Pending</span>
                  <span className="font-medium">{rupee(booking.advance_paid ?? 0)} / <span className="text-orange-600">{rupee(edit.pending_amount)}</span></span>
                  <span className="text-muted">KYC docs</span>
                  <span className={`font-medium ${(kycCount ?? 0) > 0 ? 'text-green-600' : 'text-orange-500'}`}>
                    {kycCount === null ? '…' : `${kycCount}/5 uploaded`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => save({
                  alternate_phone: edit.alternate_phone || null,
                  odometer_reading: edit.odometer_reading !== '' ? Number(edit.odometer_reading) : null,
                  helmets_provided: Number(edit.helmets_provided) || 0,
                  original_dl_taken: !!edit.original_dl_taken,
                  notes: edit.notes || null,
                  pending_amount: Number(edit.pending_amount) || 0,
                  security_deposit: Number(edit.security_deposit) || 0,
                  payment_method_detail: edit.payment_method_detail || null,
                })}
                disabled={saving}
                className="w-full py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? 'Saving…' : (isDirty || !everSaved) ? 'Save All Handover Details' : 'Re-save (all saved ✓)'}
              </button>

              {/* Save status strip — drives the workflow gate the admin asked for */}
              <div className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
                !everSaved ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                : isDirty   ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-green-200 bg-green-50 text-green-700'
              }`}>
                {!everSaved ? (
                  <>
                    <span>⚠️</span>
                    <span>Save handover details before starting the ride.</span>
                  </>
                ) : isDirty ? (
                  <>
                    <span>●</span>
                    <span>Unsaved changes — save again before starting the ride.</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Saved {fmtDateTime(booking.handover_saved_at ?? null)}</span>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-bg/30">
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Booking Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {booking.status === 'pending_payment' && (
                    <button
                      onClick={() => setConfirmAction({ action: 'confirmed', reasonRequired: false, label: 'Confirm Booking' })}
                      disabled={!!actionLoading}
                      className="py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                    >
                      ✓ Confirm Booking
                    </button>
                  )}
                  {booking.status === 'confirmed' && (
                    <button
                      onClick={() => setConfirmAction({ action: 'ongoing', reasonRequired: false, label: 'Start Ride' })}
                      disabled={!!actionLoading || !canMarkPickup}
                      title={
                        !everSaved ? 'Save handover details first' :
                        isDirty    ? 'You have unsaved changes — save again before starting' :
                        pickupErrors.length > 0 ? pickupErrors.join(' ') : ''
                      }
                      className="py-2 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✓ Start Ride
                    </button>
                  )}
                  {booking.status === 'ongoing' && (
                    <button
                      onClick={() => setConfirmAction({ action: 'completed', reasonRequired: false, label: 'Complete Ride' })}
                      disabled={!!actionLoading}
                      className="py-2 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60"
                    >
                      ✓ Complete Ride
                    </button>
                  )}
                  {(['pending_payment', 'confirmed', 'ongoing'] as const).includes(booking.status as any) && (
                    <button
                      onClick={() => setConfirmAction({ action: 'cancelled', reasonRequired: true, label: 'Cancel Booking' })}
                      disabled={!!actionLoading}
                      className="py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60"
                    >
                      ✕ Cancel Booking
                    </button>
                  )}
                  {booking.status === 'cancelled' && booking.payment_status === 'paid' && (
                    <button
                      onClick={() => setConfirmAction({ action: 'refunded', reasonRequired: true, label: 'Mark as Refunded' })}
                      disabled={!!actionLoading}
                      className="py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                    >
                      Mark Refunded
                    </button>
                  )}
                </div>
                {actionError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{actionError}</p>
                )}
              </div>

              {/* Audit timeline */}
              <div className="rounded-lg border border-border bg-white p-3 space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Activity</p>
                {logs === null ? (
                  <p className="text-xs text-muted">Loading activity…</p>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-muted">No activity yet.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {logs.map(log => (
                      <li key={log.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{LOG_LABELS[log.kind]}</p>
                          <p className="text-[10px] text-muted">
                            {fmtDateTime(log.created_at)}{log.admin_name ? ` · ${log.admin_name}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          </>
          )}

          {saveError && <p className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">{saveError}</p>}
          {savedOk && <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">Saved ✓</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Close</button>
        </div>
      </div>

      {/* Action confirmation sub-modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">{confirmAction.label}?</h3>
            {confirmAction.action === 'ongoing' && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-2.5 text-[11px] text-orange-900 space-y-1">
                <p className="font-semibold">Confirm all details are verified:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Customer & KYC checked</li>
                  <li>Odometer recorded ({String(edit.odometer_reading || '—')} km)</li>
                  <li>{Number(edit.helmets_provided) || 0} helmet{Number(edit.helmets_provided) === 1 ? '' : 's'} provided</li>
                  <li>Original DL: {edit.original_dl_taken ? 'taken' : 'not taken'}</li>
                </ul>
                <p className="pt-1 text-orange-800">After starting, the ride status becomes <strong>Ongoing</strong>.</p>
              </div>
            )}
            {confirmAction.action === 'cancelled' && (
              <p className="text-xs text-muted">This will free the bike and notify any side-effects on the bookings table.</p>
            )}
            {confirmAction.reasonRequired && (
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                className="input-field w-full h-20 resize-none"
                placeholder={confirmAction.action === 'cancelled' ? 'Cancellation reason' : 'Notes (optional)'}
              />
            )}
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirmAction(null); setActionError(null); setReasonText(''); }}
                className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => runStatusAction(confirmAction.action, reasonText)}
                disabled={actionLoading === confirmAction.action}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-60 ${confirmAction.action === 'cancelled' ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent/90'}`}
              >
                {actionLoading === confirmAction.action ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Confirmation card — read-only summary shown after handover is saved.
// Layout matches the format the admin asked for verbatim (customer name,
// alternate phone, bike, pickup/drop datetimes in 12hr clock, paid/pending,
// odometer, KM limit, deposit, helmets, DL, plus the standard policy notice
// and KYC document thumbnails).
// ─────────────────────────────────────────────────────────────────────────────
function OrderConfirmationCard({
  booking,
  edit,
  kycUrls,
  kycLoading,
  onEdit,
  onCopy,
  onWhatsApp,
  copyToast,
  actionLoading,
  canMarkPickup,
  everSaved,
  isDirty,
  pickupErrors,
  onAction,
  logs,
}: {
  booking: DetailBooking;
  edit: {
    alternate_phone: string;
    odometer_reading: string | number;
    helmets_provided: number;
    original_dl_taken: boolean;
    notes: string;
    pending_amount: number;
    security_deposit: number;
  };
  kycUrls: Record<string, string> | null;
  kycLoading: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onWhatsApp: () => void;
  copyToast: boolean;
  actionLoading: string | null;
  canMarkPickup: boolean;
  everSaved: boolean;
  isDirty: boolean;
  pickupErrors: string[];
  onAction: (action: string, reasonRequired: boolean, label: string) => void;
  logs: HandoverLog[] | null;
}) {
  const customer = customerName(booking);
  const phone    = booking.user?.phone ?? booking.customer_phone ?? '—';
  const bikeName = booking.bike?.model?.display_name ?? '—';
  const bikeDetails = [
    booking.bike?.registration_number,
    booking.bike?.color,
    booking.bike?.model?.cc ? `${booking.bike.model.cc}cc` : null,
  ].filter(Boolean).join(' · ') || '—';
  const paid    = Number(booking.advance_paid ?? booking.total_amount ?? 0);
  const pending = Number(edit.pending_amount ?? booking.pending_amount ?? 0);
  const odo     = edit.odometer_reading !== '' && edit.odometer_reading != null
                    ? String(edit.odometer_reading)
                    : (booking.odometer_reading != null ? String(booking.odometer_reading) : '—');
  const helmets = String(edit.helmets_provided ?? booking.helmets_provided ?? 0).padStart(2, '0');
  const dl      = (edit.original_dl_taken ?? booking.original_dl_taken) ? 'Yes' : 'No';

  // Bike-level rate overrides win over model defaults; fall back to ₹3 / ₹49.
  const extraKmRate     = Number(booking.bike?.extra_km_rate ?? booking.bike?.model?.excess_km_rate ?? 3);
  const latePenaltyRate = Number(booking.bike?.late_penalty_hour ?? booking.bike?.model?.late_hourly_penalty ?? 49);
  const isScooter       = booking.bike?.model?.category === 'scooter';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-green-100 text-green-700 px-2 py-1 rounded">✓ Saved</span>
          <span className="text-sm text-muted">Order Confirmation</span>
        </div>
        <button
          onClick={onEdit}
          className="text-xs font-semibold text-accent hover:underline"
        >
          ✎ Edit details
        </button>
      </div>

      <div className="rounded-xl border-2 border-accent/30 bg-accent/[0.03] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
          <div className="font-display font-bold text-base">Booking Details:</div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${STATUS_COLORS[booking.status] ?? 'bg-border'}`}>
            {booking.status.replace(/_/g, ' ')}
          </span>
        </div>

        <ConfRow label="Customer Name"      value={customer} />
        <ConfRow label="Alternate Phn no."  value={edit.alternate_phone || booking.alternate_phone || phone || '—'} />
        <ConfRow label="Bike Booked"        value={bikeName} />
        <ConfRow label="Bike Details"       value={bikeDetails} />
        <ConfRow label="Pickup  D&T"        value={fmtDateTime12(booking.start_ts)} />
        <ConfRow label="Drop  D&T"          value={fmtDateTime12(booking.end_ts)} />
        <ConfRow label="Amount Paid"        value={rupee(paid)} />
        <ConfRow label="Amount Pending"     value={rupee(pending)} accent={pending > 0} />
        <ConfRow label="Odometer Reading"   value={odo} />
        <ConfRow label="Kms limit"          value={`${booking.km_limit} km`} />
        <ConfRow label="Security deposit"   value={rupee(edit.security_deposit || booking.security_deposit || 0)} />
        <ConfRow label="Helmets Provided"   value={helmets} />
        <ConfRow label="Original DL taken"  value={dl} />
      </div>

      <div className="rounded-xl border border-border bg-bg/40 p-4 space-y-2 text-[12px] leading-relaxed">
        <p>
          <strong>{isScooter ? 'Scooty' : 'Bike'}:</strong>{' '}
          ₹{extraKmRate} per extra km / ₹{latePenaltyRate} per hour for late penalty.
        </p>
        <p>🕛 Hub timings 6:00am – 10:30pm.</p>
        <p className="italic text-muted">
          &ldquo;Please note: Bike drop-offs are not accepted after 10:30 PM. An overnight rental fee
          will apply, and bikes to be returned after 6:00am.&rdquo;
        </p>
        <p className="font-semibold text-orange-700">
          # The booking amount for the bike is non-refundable once confirmed. #
        </p>
        <p className="pt-2">Have a great and safe Ride 🤝</p>
        <p>Thank you for Choosing Zoditorentals ❤️😊</p>
      </div>

      {/* KYC document thumbnails — clickable to open full size. */}
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
          KYC Documents
        </p>
        {kycLoading ? (
          <p className="text-xs text-muted">Loading documents…</p>
        ) : !kycUrls || Object.keys(kycUrls).length === 0 ? (
          <p className="text-xs text-orange-600">No documents uploaded</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(kycUrls).map(([kind, url]) => (
              <a
                key={kind}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border overflow-hidden hover:border-accent transition-colors group"
              >
                <div className="bg-bg/40 aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={DOC_LABELS[kind] ?? kind} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="px-2 py-1 text-[11px] font-semibold text-center">
                  {DOC_LABELS[kind] ?? kind}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Action toolbar: EDIT BOOKING / COPY SUMMARY / SEND TO WHATSAPP / START RIDE */}
      <div className="rounded-xl border border-border bg-white p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onEdit}
            className="py-2 text-xs font-semibold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            ✎ Edit Booking
          </button>
          <button
            onClick={onCopy}
            className="py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            📋 Copy Summary
          </button>
          <button
            onClick={onWhatsApp}
            className="py-2 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            💬 Send to WhatsApp
          </button>
          {booking.status === 'pending_payment' && (
            <button
              onClick={() => onAction('confirmed', false, 'Confirm Booking')}
              disabled={!!actionLoading}
              className="py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60"
            >
              ✓ Confirm Booking
            </button>
          )}
          {booking.status === 'confirmed' && (
            <button
              onClick={() => onAction('ongoing', false, 'Start Ride')}
              disabled={!!actionLoading || !canMarkPickup}
              title={
                !everSaved ? 'Save handover details first' :
                isDirty    ? 'You have unsaved changes — save again before starting' :
                pickupErrors.length > 0 ? pickupErrors.join(' ') : ''
              }
              className="py-2 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🏁 Start Ride
            </button>
          )}
          {booking.status === 'ongoing' && (
            <button
              onClick={() => onAction('completed', false, 'Complete Ride')}
              disabled={!!actionLoading}
              className="py-2 text-xs font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60"
            >
              ✓ Complete Ride
            </button>
          )}
          {(['pending_payment', 'confirmed', 'ongoing'] as const).includes(booking.status as any) && (
            <button
              onClick={() => onAction('cancelled', true, 'Cancel Booking')}
              disabled={!!actionLoading}
              className="py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              ✕ Cancel Booking
            </button>
          )}
          {booking.status === 'cancelled' && booking.payment_status === 'paid' && (
            <button
              onClick={() => onAction('refunded', true, 'Mark as Refunded')}
              disabled={!!actionLoading}
              className="py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60"
            >
              Mark Refunded
            </button>
          )}
        </div>
        {copyToast && (
          <p className="text-[11px] text-green-700 text-center">Booking summary copied</p>
        )}
      </div>

      {/* Activity timeline — same audit log shown in edit mode, kept available
          in summary view so admins can see who confirmed/started without flipping modes. */}
      <div className="rounded-xl border border-border bg-white p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Activity</p>
        {logs === null ? (
          <p className="text-xs text-muted">Loading activity…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted">No activity yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {logs.map(log => (
              <li key={log.id} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{LOG_LABELS[log.kind]}</p>
                  <p className="text-[10px] text-muted">
                    {fmtDateTime(log.created_at)}{log.admin_name ? ` · ${log.admin_name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ConfRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-[13px]">
      <span className="text-muted">{label} :</span>
      <span className={`font-semibold ${accent ? 'text-orange-600' : ''}`}>{value}</span>
    </div>
  );
}
