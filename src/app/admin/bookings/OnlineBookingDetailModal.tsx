'use client';

import { useEffect, useMemo, useState } from 'react';

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
  bike: { id: string; registration_number: string | null; color: string | null; emoji: string; image_url?: string | null; model: { display_name: string } | null } | null;
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
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
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

  const [edit, setEdit] = useState({
    alternate_phone: '',
    odometer_reading: '' as string | number,
    helmets_provided: 0 as number,
    original_dl_taken: false,
    notes: '',
    pending_amount: 0 as number,
    security_deposit: 0 as number,
    payment_method_detail: '' as '' | 'cash' | 'upi' | 'online' | 'partial_online',
  });
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [kycUrls, setKycUrls] = useState<Record<string, string> | null>(null);
  const [kycLoading, setKycLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; reasonRequired: boolean; label: string } | null>(null);
  const [reasonText, setReasonText] = useState('');

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
    setEdit({
      alternate_phone: booking.alternate_phone ?? '',
      odometer_reading: booking.odometer_reading ?? '',
      helmets_provided: booking.helmets_provided ?? 0,
      original_dl_taken: !!booking.original_dl_taken,
      notes: booking.notes ?? '',
      pending_amount: booking.pending_amount ?? 0,
      security_deposit: booking.security_deposit ?? 0,
      payment_method_detail: (booking.payment_method_detail as any) ?? '',
    });
  }, [booking]);

  // Load KYC signed URLs when KYC tab opens
  useEffect(() => {
    if (!booking || tab !== 'kyc' || kycUrls !== null) return;
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
  }, [booking, tab, kycUrls]);

  const kycCount = useMemo(() => {
    if (!kycUrls) return null;
    return Object.values(kycUrls).filter(Boolean).length;
  }, [kycUrls]);

  if (!booking) return null;

  async function save(fieldsToSend: Record<string, unknown>) {
    if (!booking) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/bookings/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, ...fieldsToSend }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? 'Failed to save');
        return false;
      }
      onSaved(fieldsToSend as Partial<DetailBooking>);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2200);
      return true;
    } catch {
      setSaveError('Network error — please try again');
      return false;
    } finally {
      setSaving(false);
    }
  }

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

        {/* Tab bar */}
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

        {/* Tab content */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
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

          {/* Handover */}
          {tab === 'handover' && (
            <div className="space-y-3">
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
                  helmets_provided: Number(edit.helmets_provided) || 0,
                  original_dl_taken: !!edit.original_dl_taken,
                  notes: edit.notes || null,
                })}
                disabled={saving}
                className="w-full py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Handover Details'}
              </button>

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
                      onClick={() => setConfirmAction({ action: 'ongoing', reasonRequired: false, label: 'Mark as Picked Up' })}
                      disabled={!!actionLoading}
                      className="py-2 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                    >
                      ✓ Mark Pickup
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
            </div>
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
