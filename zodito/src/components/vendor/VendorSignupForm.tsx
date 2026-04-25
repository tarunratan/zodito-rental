'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VendorSignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: '',
    contact_phone: '',
    contact_email: '',
    pickup_area: '',
    pickup_address: '',
    upi_id: '',
    bank_account_name: '',
    bank_account_number: '',
    bank_ifsc: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const canSubmit = form.business_name.trim().length >= 2
    && /^\+?\d{10,13}$/.test(form.contact_phone.replace(/\s/g, ''))
    && form.pickup_area.trim().length >= 2
    && form.pickup_address.trim().length >= 10
    && (form.upi_id.trim().length > 0 || form.bank_account_number.trim().length > 0);

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Business information">
        <Field label="Business / Owner name *">
          <input
            value={form.business_name}
            onChange={e => update('business_name', e.target.value)}
            className="input-field"
            placeholder="e.g. Ravi Bike Rentals"
          />
        </Field>
        <Field label="Contact phone *">
          <input
            value={form.contact_phone}
            onChange={e => update('contact_phone', e.target.value)}
            className="input-field"
            placeholder="+919xxxxxxxxx"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={form.contact_email}
            onChange={e => update('contact_email', e.target.value)}
            className="input-field"
            placeholder="your@email.com"
          />
        </Field>
      </Section>

      <Section title="Pickup location">
        <p className="text-xs text-muted -mt-2 mb-3">
          This is where customers will pick up the bikes from. Only the area is shown on bike cards — full address is revealed after payment.
        </p>
        <Field label="Area / Locality *">
          <input
            value={form.pickup_area}
            onChange={e => update('pickup_area', e.target.value)}
            className="input-field"
            placeholder="e.g. Kukatpally, Miyapur, Hitech City"
          />
        </Field>
        <Field label="Full address *">
          <textarea
            value={form.pickup_address}
            onChange={e => update('pickup_address', e.target.value)}
            className="input-field min-h-[80px]"
            placeholder="Plot no, street, landmark, pincode"
          />
        </Field>
      </Section>

      <Section title="Payout details">
        <p className="text-xs text-muted -mt-2 mb-3">
          We&apos;ll use these to pay out your 80% share. UPI preferred (faster). At least one required.
        </p>
        <Field label="UPI ID (preferred)">
          <input
            value={form.upi_id}
            onChange={e => update('upi_id', e.target.value)}
            className="input-field"
            placeholder="yourname@okhdfc"
          />
        </Field>
        <div className="text-center text-xs text-muted my-2">— or —</div>
        <Field label="Bank account name">
          <input
            value={form.bank_account_name}
            onChange={e => update('bank_account_name', e.target.value)}
            className="input-field"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account number">
            <input
              value={form.bank_account_number}
              onChange={e => update('bank_account_number', e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label="IFSC">
            <input
              value={form.bank_ifsc}
              onChange={e => update('bank_ifsc', e.target.value.toUpperCase())}
              className="input-field"
              placeholder="SBIN0001234"
            />
          </Field>
        </div>
      </Section>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className="btn-accent w-full text-base py-3 disabled:bg-border disabled:text-muted disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="text-[11px] text-muted leading-relaxed text-center">
        By applying, you agree to Zodito&apos;s vendor terms. We&apos;ll review and contact you within 2-3 business days.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-3">
      <h3 className="font-display font-semibold text-base">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
