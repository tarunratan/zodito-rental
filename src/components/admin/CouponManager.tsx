'use client';

import { useState } from 'react';
import { istLocalToUtcIso } from '@/lib/datetime';

type DiscountType = 'percent' | 'fixed' | 'gst_waiver';
type UsageScope = 'one_per_user' | 'unlimited_per_user' | 'first_booking_only';

type Coupon = {
  id: string;
  code: string;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active_from: string | null;
  is_active: boolean;
  is_public: boolean;
  usage_scope: UsageScope;
  time_window_start: string | null;
  time_window_end:   string | null;
  valid_weekdays:    number[] | null;
  created_at: string;
};

const EMPTY_FORM = {
  code: '',
  label: '',
  discount_type: 'percent' as DiscountType,
  discount_value: 18,
  max_uses: '',
  expires_at: '',
  active_from: '',
  is_public: false,
  usage_scope: 'one_per_user' as UsageScope,
  time_window_start: '',
  time_window_end: '',
  valid_weekdays: [] as number[], // empty = all days
};

const WEEKDAYS = [
  { idx: 0, label: 'Sun' },
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
];

const SCOPE_LABELS: Record<UsageScope, string> = {
  one_per_user:       'One per user',
  unlimited_per_user: 'Recurring (unlimited per user)',
  first_booking_only: 'First booking only',
};

function scopeBadgeClass(scope: UsageScope): string {
  switch (scope) {
    case 'unlimited_per_user': return 'bg-success/10 text-success';
    case 'first_booking_only': return 'bg-accent/10 text-accent';
    default:                   return 'bg-border text-muted';
  }
}

export function CouponManager({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleWeekday(idx: number) {
    setForm(f => {
      const has = f.valid_weekdays.includes(idx);
      return { ...f, valid_weekdays: has ? f.valid_weekdays.filter(d => d !== idx) : [...f.valid_weekdays, idx].sort() };
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.toUpperCase().trim(),
          label: form.label.trim(),
          discount_type: form.discount_type,
          discount_value: form.discount_type === 'gst_waiver' ? 0 : Number(form.discount_value),
          max_uses: form.max_uses ? Number(form.max_uses) : null,
          expires_at: istLocalToUtcIso(form.expires_at),
          active_from: istLocalToUtcIso(form.active_from),
          is_public: form.is_public,
          usage_scope: form.usage_scope,
          time_window_start: form.time_window_start || null,
          time_window_end:   form.time_window_end   || null,
          valid_weekdays: form.valid_weekdays.length > 0 ? form.valid_weekdays : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create coupon');
      setCoupons(prev => [data.coupon, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !coupon.is_active }),
    });
    if (res.ok) setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
  }

  async function togglePublic(coupon: Coupon) {
    const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !coupon.is_public }),
    });
    if (res.ok) setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_public: !c.is_public } : c));
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Delete this coupon? This will also remove all usage history.')) return;
    setDeleteError(null);
    const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCoupons(prev => prev.filter(c => c.id !== id));
    } else {
      let msg = 'Failed to delete coupon.';
      try { const d = await res.json(); msg = d.error || msg; } catch { /* noop */ }
      setDeleteError(msg);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-semibold text-xl">Coupons</h2>
          <p className="text-sm text-muted mt-0.5">{coupons.length} coupon{coupons.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setFormError(null); }}
          className="btn-accent text-sm"
        >
          {showForm ? 'Cancel' : '+ New Coupon'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-5">
          <h3 className="font-semibold text-sm mb-1">New Coupon</h3>

          {/* Identity */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Code (shown to customers)</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. NOGST, WELCOME10, HAPPY7"
                className="input-field font-mono uppercase tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Label (admin name)</label>
              <input
                required
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. GST Waiver – April 2026"
                className="input-field"
              />
            </div>
          </div>

          {/* Discount */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Discount type</label>
              <select
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as DiscountType }))}
                className="input-field"
              >
                <option value="percent">% Off subtotal</option>
                <option value="fixed">₹ Fixed amount</option>
                <option value="gst_waiver">GST Waiver (exact)</option>
              </select>
            </div>
            {form.discount_type !== 'gst_waiver' && (
              <div className="space-y-1.5">
                <label className="form-label">{form.discount_type === 'percent' ? 'Percentage (%)' : 'Amount (₹)'}</label>
                <input
                  required
                  type="number"
                  min={0}
                  max={form.discount_type === 'percent' ? 100 : undefined}
                  value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                  className="input-field"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="form-label">Max global uses (blank = unlimited)</label>
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Unlimited"
                className="input-field"
              />
            </div>
          </div>

          {/* Usage scope */}
          <div className="space-y-2">
            <label className="form-label">Per-user usage</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {(Object.keys(SCOPE_LABELS) as UsageScope[]).map(scope => (
                <button
                  type="button"
                  key={scope}
                  onClick={() => setForm(f => ({ ...f, usage_scope: scope }))}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                    form.usage_scope === scope
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:bg-bg'
                  }`}
                >
                  <div className="font-semibold">{SCOPE_LABELS[scope]}</div>
                  <div className="text-[10px] mt-0.5 opacity-80">
                    {scope === 'one_per_user' && 'Default — each user can redeem once.'}
                    {scope === 'unlimited_per_user' && 'Same user can use repeatedly (e.g. GST waiver).'}
                    {scope === 'first_booking_only' && 'Only redeemable on the user\'s first booking.'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Active window */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Active from (blank = immediately)</label>
              <input
                type="datetime-local"
                value={form.active_from}
                onChange={e => setForm(f => ({ ...f, active_from: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Expiry (blank = never)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          {/* Happy-hour + weekdays */}
          <div className="space-y-3 rounded-lg bg-bg p-4 border border-border">
            <div className="flex items-baseline justify-between">
              <label className="form-label">Happy-hour window (IST, optional)</label>
              <span className="text-[10px] text-muted">leave blank for all-day</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted">Start</label>
                <input
                  type="time"
                  value={form.time_window_start}
                  onChange={e => setForm(f => ({ ...f, time_window_start: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted">End (can cross midnight)</label>
                <input
                  type="time"
                  value={form.time_window_end}
                  onChange={e => setForm(f => ({ ...f, time_window_end: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-muted">Days of week (blank = all)</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(d => (
                  <button
                    type="button"
                    key={d.idx}
                    onClick={() => toggleWeekday(d.idx)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      form.valid_weekdays.includes(d.idx)
                        ? 'bg-accent text-white'
                        : 'bg-card border border-border text-muted hover:bg-border/50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm font-medium">Show in &quot;Available Offers&quot; for customers</span>
            </label>
          </div>

          {formError && <p className="text-xs text-danger">{formError}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-accent disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Coupon'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-muted hover:text-primary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleteError && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
          {deleteError}
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          No coupons yet. Create one to get started.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Label</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Discount</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Scope</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Schedule</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Uses</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Visible</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map(coupon => (
                  <tr key={coupon.id} className="hover:bg-bg transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-accent tracking-wider">{coupon.code}</span>
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[160px] truncate">{coupon.label}</td>
                    <td className="px-4 py-3 text-sm">
                      {coupon.discount_type === 'gst_waiver' ? 'GST Waiver'
                        : coupon.discount_type === 'percent' ? `${coupon.discount_value}% off`
                        : `₹${coupon.discount_value} off`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${scopeBadgeClass(coupon.usage_scope)}`}>
                        {SCOPE_LABELS[coupon.usage_scope] ?? coupon.usage_scope}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted">
                      {scheduleSummary(coupon)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {coupon.used_count}
                      {coupon.max_uses !== null && <span className="text-muted/60"> / {coupon.max_uses}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(coupon)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          coupon.is_active
                            ? 'bg-success/10 text-success hover:bg-success/20'
                            : 'bg-border text-muted hover:bg-border'
                        }`}
                      >
                        {coupon.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublic(coupon)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          coupon.is_public ? 'bg-accent/10 text-accent hover:bg-accent/20' : 'bg-border text-muted hover:bg-border'
                        }`}
                      >
                        {coupon.is_public ? 'Public' : 'Private'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteCoupon(coupon.id)}
                        className="text-xs text-muted hover:text-danger transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function scheduleSummary(c: Coupon): string {
  const parts: string[] = [];
  if (c.time_window_start && c.time_window_end) {
    parts.push(`${c.time_window_start.slice(0, 5)}–${c.time_window_end.slice(0, 5)}`);
  }
  if (c.valid_weekdays && c.valid_weekdays.length > 0 && c.valid_weekdays.length < 7) {
    parts.push(c.valid_weekdays.map(d => WEEKDAYS[d]?.label ?? d).join('·'));
  }
  if (c.active_from) {
    parts.push(`from ${new Date(c.active_from).toLocaleDateString('en-IN')}`);
  }
  if (c.expires_at) {
    parts.push(`till ${new Date(c.expires_at).toLocaleDateString('en-IN')}`);
  }
  return parts.length ? parts.join(' · ') : 'Always';
}
