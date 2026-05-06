'use client';

import { useState } from 'react';
import { TIER_LABELS, ADMIN_TIER_LABELS, TIER_ORDER } from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';
import { formatINR } from '@/lib/utils';

type Bike = any;

type PkgRow = {
  tier: PackageTier;
  price: number;
  km_limit: number;
  is_override: boolean;
  model_price: number;
  model_km_limit: number;
};

type CustomPkg = {
  id: string;
  label: string;
  duration_hours: number;
  price: number;
  km_limit: number;
  is_active: boolean;
};

const BLANK_CUSTOM = { label: '', days: '', hours: '', price: '', km_limit: '', unit: 'days' as 'days' | 'hours' };

export function BikePricingManager({ initialBikes }: { initialBikes: Bike[] }) {
  const [bikes, setBikes]             = useState<Bike[]>(initialBikes);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [packages, setPackages]       = useState<PkgRow[]>([]);
  const [customPkgs, setCustomPkgs]   = useState<CustomPkg[]>([]);
  const [loadingPkg, setLoadingPkg]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [newCustom, setNewCustom]     = useState({ ...BLANK_CUSTOM });
  const [addingCustom, setAddingCustom] = useState(false);
  const [showPanel, setShowPanel]     = useState(false);  // mobile bottom-sheet open

  async function openEditor(bike: Bike) {
    setEditingBike(bike);
    setShowPanel(true);
    setError(null);
    setSuccess(null);
    setLoadingPkg(true);
    setCustomPkgs([]);
    setNewCustom({ ...BLANK_CUSTOM });
    try {
      const [pkgRes, customRes] = await Promise.all([
        fetch(`/api/admin/bikes/${bike.id}/packages`),
        fetch(`/api/admin/bikes/${bike.id}/custom-packages`),
      ]);
      const pkgData    = await pkgRes.json();
      const customData = await customRes.json();
      if (pkgRes.ok) setPackages(pkgData.packages);
      else setError(pkgData.error ?? 'Failed to load pricing');
      if (customRes.ok) setCustomPkgs(customData.packages ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoadingPkg(false);
    }
  }

  function closePanel() {
    setShowPanel(false);
  }

  function updateField(tier: PackageTier, field: 'price' | 'km_limit', raw: string) {
    const val = field === 'price' ? parseFloat(raw) : parseInt(raw, 10);
    if (isNaN(val) || val < 0) return;
    setPackages(prev => prev.map(p => p.tier === tier ? { ...p, [field]: val, is_override: true } : p));
  }

  function resetTier(tier: PackageTier) {
    setPackages(prev => prev.map(p =>
      p.tier === tier ? { ...p, price: p.model_price, km_limit: p.model_km_limit, is_override: false } : p
    ));
  }

  function resetAll() {
    setPackages(prev => prev.map(p => ({ ...p, price: p.model_price, km_limit: p.model_km_limit, is_override: false })));
  }

  async function save() {
    if (!editingBike) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const overrides = packages.filter(p => p.is_override).map(p => ({ tier: p.tier, price: p.price, km_limit: p.km_limit }));
      const res = await fetch(`/api/admin/bikes/${editingBike.id}/packages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: overrides }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      setBikes(prev => prev.map(b => b.id === editingBike.id ? { ...b, bike_packages: overrides } : b));
      setSuccess(`Saved — ${overrides.length} tier${overrides.length !== 1 ? 's' : ''} set`);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  // Compute duration_hours from the newCustom form fields
  function customDurationHours(): number {
    if (newCustom.unit === 'days') {
      const days = parseFloat(newCustom.days);
      return isNaN(days) ? 0 : Math.round(days * 24);
    }
    return parseInt(newCustom.hours, 10) || 0;
  }

  async function addCustomPackage() {
    if (!editingBike) return;
    const durationHours = customDurationHours();
    if (!newCustom.label.trim()) { setError('Label is required'); return; }
    if (durationHours < 1) { setError('Duration must be at least 1 hour / 0.04 days'); return; }
    const price = parseFloat(newCustom.price);
    const kmLimit = parseInt(newCustom.km_limit, 10);
    if (isNaN(price) || price < 0) { setError('Enter a valid price'); return; }

    setAddingCustom(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/admin/bikes/${editingBike.id}/custom-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newCustom.label.trim(), duration_hours: durationHours, price, km_limit: isNaN(kmLimit) ? 0 : kmLimit }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to add package'); return; }
      setCustomPkgs(prev => [...prev, data.package].sort((a: CustomPkg, b: CustomPkg) => a.duration_hours - b.duration_hours));
      setNewCustom({ ...BLANK_CUSTOM });
      setSuccess('Custom package added');
    } catch {
      setError('Network error — please try again');
    } finally {
      setAddingCustom(false);
    }
  }

  async function deleteCustomPackage(pkgId: string) {
    if (!editingBike) return;
    setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/admin/bikes/${editingBike.id}/custom-packages?pkg_id=${pkgId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to delete'); return; }
      setCustomPkgs(prev => prev.filter(p => p.id !== pkgId));
      setSuccess('Package deleted');
    } catch {
      setError('Network error — please try again');
    }
  }

  const hasOverride = packages.some(p => p.is_override);
  const previewHours = customDurationHours();

  // ── Edit panel content (shared between mobile sheet and desktop sidebar) ──
  const EditPanel = (
    <div className="flex flex-col h-full">
      {/* Bike header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-primary/5 flex items-center justify-center shrink-0">
          {editingBike?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editingBike.image_url} alt={editingBike?.model?.display_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl">{editingBike?.emoji}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">{editingBike?.model?.display_name}</div>
          <div className="text-xs text-muted">{editingBike?.color} · {editingBike?.model?.cc}cc</div>
        </div>
        {/* Close button (mobile) */}
        <button onClick={closePanel} className="lg:hidden text-muted hover:text-primary text-xl leading-none pl-2">✕</button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {loadingPkg ? (
          <div className="space-y-3 pt-2">
            {TIER_ORDER.map(t => <div key={t} className="h-[72px] bg-border/30 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ── Standard tiers ── */}
            {packages.map(pkg => (
              <div
                key={pkg.tier}
                className={`rounded-lg border transition-colors ${pkg.is_override ? 'border-accent/50 bg-accent/5' : 'border-border'}`}
              >
                {/* Tier header row */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                  <span className="text-xs font-semibold leading-tight">
                    {ADMIN_TIER_LABELS[pkg.tier] ?? TIER_LABELS[pkg.tier]}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {pkg.is_override && (
                      <span className="text-[9px] bg-accent text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Set</span>
                    )}
                    {pkg.is_override && (
                      <button onClick={() => resetTier(pkg.tier)} className="text-[10px] text-muted hover:text-danger underline">Reset</button>
                    )}
                  </div>
                </div>

                {/* Price + KM inputs */}
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Price (₹)</label>
                    <input
                      type="number" inputMode="numeric" min={0} step={1} value={pkg.price || ''}
                      placeholder="0"
                      onChange={e => updateField(pkg.tier, 'price', e.target.value)}
                      className="input-field text-sm py-2 px-2.5 w-full"
                    />
                    {pkg.is_override && pkg.model_price > 0 && (
                      <p className="text-[10px] text-muted mt-0.5">Model: {formatINR(pkg.model_price)}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">KM Limit</label>
                    <input
                      type="number" inputMode="numeric" min={0} step={10} value={pkg.km_limit || ''}
                      placeholder="0"
                      onChange={e => updateField(pkg.tier, 'km_limit', e.target.value)}
                      className="input-field text-sm py-2 px-2.5 w-full"
                    />
                    {pkg.is_override && pkg.model_km_limit > 0 && (
                      <p className="text-[10px] text-muted mt-0.5">Model: {pkg.model_km_limit} km</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* ── Custom packages ── */}
            <div className="pt-3 mt-1 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold">Custom Packages</h4>
                  <p className="text-[11px] text-muted mt-0.5">
                    Set any duration + price not in the list above (e.g. 15 days, 20 days).
                  </p>
                </div>
              </div>

              {/* Existing */}
              {customPkgs.length > 0 && (
                <div className="space-y-2 mb-3">
                  {customPkgs.map(cp => (
                    <div key={cp.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-bg">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs">{cp.label}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {cp.duration_hours % 24 === 0
                            ? `${cp.duration_hours / 24} days`
                            : `${cp.duration_hours} hrs`
                          } · {formatINR(cp.price)} · {cp.km_limit} km
                        </div>
                      </div>
                      <button onClick={() => deleteCustomPackage(cp.id)} className="text-[11px] text-danger hover:underline shrink-0">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new */}
              <div className="rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 p-3 space-y-3">
                <p className="text-[11px] font-bold text-accent uppercase tracking-wider">+ New custom package</p>

                {/* Label */}
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Label <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. 15 Days Package"
                    value={newCustom.label}
                    onChange={e => setNewCustom(p => ({ ...p, label: e.target.value }))}
                    className="input-field text-sm py-2 px-2.5 w-full"
                  />
                </div>

                {/* Duration — days or hours toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-muted uppercase tracking-wide">Duration <span className="text-danger">*</span></label>
                    <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setNewCustom(p => ({ ...p, unit: 'days', hours: '' }))}
                        className={`px-2.5 py-1 transition-colors ${newCustom.unit === 'days' ? 'bg-accent text-white' : 'bg-bg text-muted hover:bg-border/50'}`}
                      >
                        Days
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewCustom(p => ({ ...p, unit: 'hours', days: '' }))}
                        className={`px-2.5 py-1 transition-colors ${newCustom.unit === 'hours' ? 'bg-accent text-white' : 'bg-bg text-muted hover:bg-border/50'}`}
                      >
                        Hours
                      </button>
                    </div>
                  </div>
                  {newCustom.unit === 'days' ? (
                    <div className="relative">
                      <input
                        type="number" inputMode="decimal" min={0.5} step={0.5}
                        placeholder="e.g. 15"
                        value={newCustom.days}
                        onChange={e => setNewCustom(p => ({ ...p, days: e.target.value }))}
                        className="input-field text-sm py-2 px-2.5 w-full pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">days</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="number" inputMode="numeric" min={1} step={1}
                        placeholder="e.g. 360"
                        value={newCustom.hours}
                        onChange={e => setNewCustom(p => ({ ...p, hours: e.target.value }))}
                        className="input-field text-sm py-2 px-2.5 w-full pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">hrs</span>
                    </div>
                  )}
                  {previewHours > 0 && (
                    <p className="text-[10px] text-accent mt-1">
                      = {previewHours} hrs {previewHours % 24 === 0 ? `(${previewHours / 24} days)` : ''}
                    </p>
                  )}
                </div>

                {/* Price + KM */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Price (₹) <span className="text-danger">*</span></label>
                    <input
                      type="number" inputMode="numeric" min={0} step={1} placeholder="e.g. 3500"
                      value={newCustom.price}
                      onChange={e => setNewCustom(p => ({ ...p, price: e.target.value }))}
                      className="input-field text-sm py-2 px-2.5 w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">KM Limit</label>
                    <input
                      type="number" inputMode="numeric" min={0} step={10} placeholder="e.g. 1200"
                      value={newCustom.km_limit}
                      onChange={e => setNewCustom(p => ({ ...p, km_limit: e.target.value }))}
                      className="input-field text-sm py-2 px-2.5 w-full"
                    />
                  </div>
                </div>

                {/* Preview pill */}
                {newCustom.label && previewHours > 0 && newCustom.price && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-accent/20 text-xs">
                    <span className="text-accent font-bold">Preview:</span>
                    <span className="font-semibold">{newCustom.label}</span>
                    <span className="text-muted">·</span>
                    <span>{previewHours % 24 === 0 ? `${previewHours / 24} days` : `${previewHours} hrs`}</span>
                    <span className="text-muted">·</span>
                    <span className="text-accent font-semibold">{formatINR(parseFloat(newCustom.price) || 0)}</span>
                    {newCustom.km_limit && <><span className="text-muted">·</span><span>{newCustom.km_limit} km</span></>}
                  </div>
                )}

                <button
                  onClick={addCustomPackage}
                  disabled={addingCustom}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-60"
                >
                  {addingCustom ? 'Adding…' : 'Add Custom Package'}
                </button>
              </div>
            </div>
          </>
        )}

        {error   && <div className="mt-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-2.5">{error}</div>}
        {success && <div className="mt-2 text-xs text-success bg-success/10 border border-success/20 rounded-lg p-2.5">✓ {success}</div>}
      </div>

      {/* Sticky save bar */}
      {!loadingPkg && (
        <div className="shrink-0 px-5 py-3 border-t border-border bg-white flex gap-2">
          <button onClick={save} disabled={saving} className="btn-accent flex-1 py-2.5 text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Pricing'}
          </button>
          {hasOverride && (
            <button onClick={resetAll} disabled={saving} className="px-3 py-2.5 border border-border rounded-xl text-sm text-muted hover:text-danger hover:border-danger transition-colors">
              Reset all
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl">Per-Bike Pricing</h1>
        <p className="text-muted text-sm mt-1">
          Set prices for each bike. Standard tiers cover hourly/daily rentals; add custom packages for longer durations.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_440px] lg:gap-6 lg:items-start">
        {/* ── Bike list ── */}
        <div className="space-y-3">
          {bikes.length === 0 && <p className="text-muted text-sm py-8 text-center">No active bikes found.</p>}
          {bikes.map(bike => {
            const overrideCount = (bike.bike_packages ?? []).length;
            const isActive = editingBike?.id === bike.id;
            const isScooter = bike.model?.category === 'scooter';
            return (
              <button
                key={bike.id}
                onClick={() => openEditor(bike)}
                className={`w-full text-left card p-4 transition-all hover:shadow-md active:scale-[0.99] ${isActive ? 'ring-2 ring-accent' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-primary/5 flex items-center justify-center shrink-0">
                    {bike.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bike.image_url} alt={bike.model.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{bike.emoji}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      {bike.model.display_name}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isScooter ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isScooter ? '🛵 Scooter' : '🏍️ Bike'}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {bike.color} · {bike.model.cc}cc
                      {bike.registration_number && ` · ${bike.registration_number}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {overrideCount > 0 && (
                      <span className="text-[10px] bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full">
                        {overrideCount} set
                      </span>
                    )}
                    <span className="text-xs text-accent font-medium">Edit →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Desktop: sticky sidebar panel ── */}
        {editingBike ? (
          <div className="hidden lg:flex flex-col card overflow-hidden sticky top-20 max-h-[88vh]">
            {EditPanel}
          </div>
        ) : (
          <div className="hidden lg:flex card p-8 text-center text-muted flex-col items-center gap-3">
            <div className="text-4xl">💰</div>
            <p className="text-sm">Select a bike to edit its pricing</p>
          </div>
        )}
      </div>

      {/* ── Mobile: bottom sheet ── */}
      {editingBike && showPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={closePanel}
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden flex flex-col bg-white rounded-t-2xl shadow-2xl"
            style={{ maxHeight: '92dvh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            {EditPanel}
          </div>
        </>
      )}
    </div>
  );
}
