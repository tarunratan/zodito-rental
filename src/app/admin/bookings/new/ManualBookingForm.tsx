'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { istLocalToUtcIso, formatIstDateTime } from '@/lib/datetime';

type BikeOption = { id: string; emoji: string; registration_number: string | null; model: { display_name: string } | null };

// Mirror of EMPTY_MANUAL from the old BookingsManager modal. Keeping the
// field names identical means the POST body to /api/admin/bookings/manual
// stays unchanged — only the form layout/UX changed.
const EMPTY = {
  bike_id: '',
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  alternate_phone: '',
  start_ts: '',
  end_ts: '',
  total_amount: '',
  advance_paid: '',
  security_deposit: '',
  km_limit: '',
  odometer_reading: '',
  payment_method_detail: '' as '' | 'cash' | 'upi' | 'online' | 'partial_online',
  payment_proof_url: '',
  helmets_provided: '0',
  original_dl_taken: false,
  notes: '',
  kyc_dl_front_url: '',
  kyc_dl_back_url: '',
  kyc_aadhaar_front_url: '',
  kyc_aadhaar_back_url: '',
  kyc_selfie_url: '',
};

const KYC_KEYS = ['kyc_dl_front_url', 'kyc_dl_back_url', 'kyc_aadhaar_front_url', 'kyc_aadhaar_back_url', 'kyc_selfie_url'] as const;

export function ManualBookingForm({ allBikes }: { allBikes: BikeOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setForm(f => ({ ...f, [`kyc_${docType}_url`]: data.path }));
      } else {
        setError(data.error ?? 'Upload failed');
      }
    } catch {
      setError('Network error during upload');
    } finally {
      setKycUploading(p => ({ ...p, [docType]: false }));
    }
  }

  const kycCount = KYC_KEYS.filter(k => (form as any)[k]).length;
  const pendingAtPickup = form.total_amount && form.advance_paid
    ? Math.max(0, parseFloat(form.total_amount) - parseFloat(form.advance_paid))
    : null;

  async function save() {
    setError(null);
    if (!form.bike_id || !form.customer_name.trim() || !form.customer_phone.trim() || !form.start_ts || !form.end_ts) {
      setError('Bike, customer name, phone, pickup and drop-off are all required');
      return;
    }
    const total   = form.total_amount ? parseFloat(form.total_amount) : 0;
    const advance = form.advance_paid ? parseFloat(form.advance_paid) : 0;
    if (advance > total) {
      setError('Advance paid cannot exceed total amount');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/bookings/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bike_id: form.bike_id,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim(),
          customer_email: form.customer_email.trim() || undefined,
          alternate_phone: form.alternate_phone.trim() || undefined,
          start_ts: istLocalToUtcIso(form.start_ts),
          end_ts: istLocalToUtcIso(form.end_ts),
          total_amount: total,
          advance_paid: advance,
          security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : 0,
          km_limit: form.km_limit ? parseInt(form.km_limit, 10) : 0,
          odometer_reading: form.odometer_reading ? parseInt(form.odometer_reading, 10) : undefined,
          helmets_provided: parseInt(form.helmets_provided, 10) || 0,
          original_dl_taken: form.original_dl_taken,
          payment_method_detail: form.payment_method_detail || undefined,
          payment_proof_url: form.payment_proof_url.trim() || undefined,
          kyc_dl_front_url:      form.kyc_dl_front_url      || undefined,
          kyc_dl_back_url:       form.kyc_dl_back_url       || undefined,
          kyc_aadhaar_front_url: form.kyc_aadhaar_front_url || undefined,
          kyc_aadhaar_back_url:  form.kyc_aadhaar_back_url  || undefined,
          kyc_selfie_url:        form.kyc_selfie_url        || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create booking');
        return;
      }
      // Land back on the list — the new booking shows at the top of Active.
      router.push('/admin/bookings');
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Customer ─────────────────────────────────────────────────────── */}
      <Section icon="👤" title="Customer">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name" required>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
              className="input-field w-full" placeholder="e.g. Ravi Kumar" />
          </Field>
          <Field label="Primary phone" required>
            <input type="tel" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
              className="input-field w-full" placeholder="+91 98765 43210" />
          </Field>
          <Field label="Alternate phone">
            <input type="tel" value={form.alternate_phone} onChange={e => setForm(f => ({ ...f, alternate_phone: e.target.value }))}
              className="input-field w-full" placeholder="Optional" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))}
              className="input-field w-full" placeholder="Optional — receipt email sent here" />
          </Field>
        </div>
      </Section>

      {/* ── KYC Documents ────────────────────────────────────────────────── */}
      <Section icon="🪪" title="KYC documents" subtitle={`Optional — ${kycCount}/5 uploaded so far. Files go to secure storage.`}>
        <div>
          <p className="text-xs font-semibold text-primary mb-2">Driving licence</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DocSlot label="Front"          docType="dl_front"      value={form.kyc_dl_front_url}      uploading={!!kycUploading['dl_front']}      onUpload={f => uploadKycDoc(f, 'dl_front')}      onClear={() => setForm(p => ({ ...p, kyc_dl_front_url: '' }))} />
            <DocSlot label="Back"           docType="dl_back"       value={form.kyc_dl_back_url}       uploading={!!kycUploading['dl_back']}       onUpload={f => uploadKycDoc(f, 'dl_back')}       onClear={() => setForm(p => ({ ...p, kyc_dl_back_url: '' }))} />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold text-primary mb-2">Aadhaar card</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DocSlot label="Front"          docType="aadhaar_front" value={form.kyc_aadhaar_front_url} uploading={!!kycUploading['aadhaar_front']} onUpload={f => uploadKycDoc(f, 'aadhaar_front')} onClear={() => setForm(p => ({ ...p, kyc_aadhaar_front_url: '' }))} />
            <DocSlot label="Back"           docType="aadhaar_back"  value={form.kyc_aadhaar_back_url}  uploading={!!kycUploading['aadhaar_back']}  onUpload={f => uploadKycDoc(f, 'aadhaar_back')}  onClear={() => setForm(p => ({ ...p, kyc_aadhaar_back_url: '' }))} />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold text-primary mb-2">Selfie with document</p>
          <div className="max-w-xs">
            <DocSlot label="Selfie"         docType="selfie"        value={form.kyc_selfie_url}        uploading={!!kycUploading['selfie']}        onUpload={f => uploadKycDoc(f, 'selfie')}        onClear={() => setForm(p => ({ ...p, kyc_selfie_url: '' }))} />
          </div>
        </div>
      </Section>

      {/* ── Trip ─────────────────────────────────────────────────────────── */}
      <Section icon="🏍️" title="Trip">
        <div>
          <Field label="Bike" required>
            <select value={form.bike_id} onChange={e => setForm(f => ({ ...f, bike_id: e.target.value }))} className="input-field w-full">
              <option value="">Select a bike…</option>
              {allBikes.map(b => (
                <option key={b.id} value={b.id}>
                  {b.emoji} {b.model?.display_name ?? 'Unknown'}{b.registration_number ? ` · ${b.registration_number}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Pickup date & time" required>
            <input type="datetime-local" value={form.start_ts} onChange={e => setForm(f => ({ ...f, start_ts: e.target.value }))} className="input-field w-full" />
          </Field>
          <Field label="Drop-off date & time" required>
            <input type="datetime-local" value={form.end_ts} min={form.start_ts} onChange={e => setForm(f => ({ ...f, end_ts: e.target.value }))} className="input-field w-full" />
          </Field>
          <Field label="KM limit">
            <input type="number" min={0} value={form.km_limit} onChange={e => setForm(f => ({ ...f, km_limit: e.target.value }))} className="input-field w-full" placeholder="e.g. 200" />
          </Field>
          <Field label="Odometer at pickup (km)">
            <input type="number" min={0} value={form.odometer_reading} onChange={e => setForm(f => ({ ...f, odometer_reading: e.target.value }))} className="input-field w-full" placeholder="e.g. 12540" />
          </Field>
        </div>
      </Section>

      {/* ── Payment ──────────────────────────────────────────────────────── */}
      <Section icon="💰" title="Payment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Total amount (₹)">
            <input type="number" min={0} step={1} value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} className="input-field w-full" />
          </Field>
          <Field label="Advance paid (₹)" hint="0 if not yet collected">
            <input type="number" min={0} step={1} value={form.advance_paid} onChange={e => setForm(f => ({ ...f, advance_paid: e.target.value }))} className="input-field w-full" />
          </Field>
        </div>
        {pendingAtPickup !== null && (
          <div className="mt-2 p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-700">
            Pending at pickup: <span className="font-bold">₹{pendingAtPickup.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Security deposit (₹)">
            <input type="number" min={0} step={1} value={form.security_deposit} onChange={e => setForm(f => ({ ...f, security_deposit: e.target.value }))} className="input-field w-full" placeholder="500" />
          </Field>
          <Field label="Payment method">
            <select value={form.payment_method_detail} onChange={e => setForm(f => ({ ...f, payment_method_detail: e.target.value as any }))} className="input-field w-full">
              <option value="">— select —</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="online">Online (Razorpay)</option>
              <option value="partial_online">Partial (online + cash)</option>
            </select>
          </Field>
        </div>
        <Field label="Payment proof URL" hint="Paste a link to a screenshot or receipt">
          <input type="url" value={form.payment_proof_url} onChange={e => setForm(f => ({ ...f, payment_proof_url: e.target.value }))} className="input-field w-full" placeholder="https://…" />
        </Field>
      </Section>

      {/* ── Handover ─────────────────────────────────────────────────────── */}
      <Section icon="✅" title="Handover">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="Helmets provided">
            <input type="number" min={0} max={5} value={form.helmets_provided} onChange={e => setForm(f => ({ ...f, helmets_provided: e.target.value }))} className="input-field w-full" />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
            <input type="checkbox" checked={form.original_dl_taken} onChange={e => setForm(f => ({ ...f, original_dl_taken: e.target.checked }))} className="w-4 h-4 accent-accent" />
            <span className="text-sm font-medium">Original DL taken</span>
          </label>
        </div>
        <Field label="Internal remarks / notes">
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field w-full h-20 resize-none" placeholder="Any internal notes about this booking…" />
        </Field>
      </Section>

      {/* Summary preview — pulled from the form so admin can sanity-check before save. */}
      {(form.customer_name || form.start_ts || form.bike_id) && (
        <div className="rounded-xl border border-border bg-bg/40 p-4 space-y-1 text-sm">
          <p className="font-semibold text-[11px] uppercase tracking-wide text-muted mb-2">Quick preview</p>
          <div className="grid grid-cols-[120px_1fr] gap-y-1">
            <span className="text-muted">Customer</span><span className="font-medium">{form.customer_name || '—'}</span>
            <span className="text-muted">Phone</span><span className="font-medium">{form.customer_phone || '—'}</span>
            <span className="text-muted">Bike</span><span className="font-medium">{allBikes.find(b => b.id === form.bike_id)?.model?.display_name ?? '—'}</span>
            <span className="text-muted">Pickup</span><span className="font-medium">{form.start_ts ? formatIstDateTime(istLocalToUtcIso(form.start_ts) ?? form.start_ts) : '—'}</span>
            <span className="text-muted">Drop-off</span><span className="font-medium">{form.end_ts ? formatIstDateTime(istLocalToUtcIso(form.end_ts) ?? form.end_ts) : '—'}</span>
            <span className="text-muted">Total</span><span className="font-medium">₹{parseFloat(form.total_amount || '0').toLocaleString('en-IN')}</span>
            <span className="text-muted">KYC</span><span className={`font-medium ${kycCount > 0 ? 'text-green-600' : 'text-orange-500'}`}>{kycCount}/5 uploaded</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="sticky bottom-0 bg-white border-t border-border -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
        <button onClick={() => router.push('/admin/bookings')} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/40">
          Cancel
        </button>
        <button onClick={save} disabled={submitting} className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-60 font-semibold">
          {submitting ? 'Creating…' : 'Save booking'}
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h2 className="font-display font-semibold text-base">{title}</h2>
        {subtitle && <span className="text-[11px] text-muted ml-1">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted block mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function DocSlot({ label, value, uploading, onUpload, onClear }: {
  label: string;
  docType: string;
  value: string;
  uploading: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-bg/50 p-3 flex flex-col items-center gap-2 text-center min-h-[120px] justify-center transition-colors hover:border-accent/40">
      {uploading ? (
        <div className="space-y-1">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] text-muted">Uploading…</p>
        </div>
      ) : value ? (
        <div className="space-y-1.5 w-full">
          <div className="text-green-500 text-2xl leading-none">✓</div>
          <p className="text-[11px] font-semibold text-green-700">{label} — saved</p>
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
            <p className="text-[11px] font-semibold text-muted">{label}</p>
            <p className="text-[10px] text-accent">Tap to upload</p>
          </div>
        </label>
      )}
    </div>
  );
}
