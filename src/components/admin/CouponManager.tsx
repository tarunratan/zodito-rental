'use client';

import { useState } from 'react';

type DiscountType = 'percent' | 'fixed' | 'gst_waiver';

type Coupon = {
  id: string;
  code: string;
  label: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
};

const EMPTY_FORM = {
  code: '',
  label: '',
  discount_type: 'percent' as DiscountType,
  discount_value: 18,
  max_uses: '',
  expires_at: '',
  is_public: false,
};

export function CouponManager({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          expires_at: form.expires_at || null,
          is_public: form.is_public,
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
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-sm mb-1">New Coupon</h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Code (shown to customers)</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. NOGST, WELCOME10"
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
              <label className="form-label">Max uses (blank = unlimited)</label>
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

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Expiry (blank = never)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="input-field"
              />
            </div>
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
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Uses</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">Expires</th>
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
                    <td className="px-4 py-3 text-muted max-w-[180px] truncate">{coupon.label}</td>
                    <td className="px-4 py-3 text-sm">
                      {coupon.discount_type === 'gst_waiver' ? 'GST Waiver'
                        : coupon.discount_type === 'percent' ? `${coupon.discount_value}% off`
                        : `₹${coupon.discount_value} off`}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {coupon.used_count}
                      {coupon.max_uses !== null && <span className="text-muted/60"> / {coupon.max_uses}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('en-IN') : '—'}
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${coupon.is_public ? 'bg-accent/10 text-accent' : 'bg-border text-muted'}`}>
                        {coupon.is_public ? 'Public' : 'Private'}
                      </span>
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
