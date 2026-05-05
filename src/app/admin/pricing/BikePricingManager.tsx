'use client';

import { useState } from 'react';
import { TIER_LABELS, TIER_ORDER, isFlexTier, FLEX_TIER_RANGES } from '@/lib/pricing';
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

export function BikePricingManager({ initialBikes }: { initialBikes: Bike[] }) {
  const [bikes, setBikes]           = useState<Bike[]>(initialBikes);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [packages, setPackages]     = useState<PkgRow[]>([]);
  const [loadingPkg, setLoadingPkg] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  async function openEditor(bike: Bike) {
    setEditingBike(bike);
    setError(null);
    setSuccess(null);
    setLoadingPkg(true);
    try {
      const res  = await fetch(`/api/admin/bikes/${bike.id}/packages`);
      const data = await res.json();
      if (res.ok) setPackages(data.packages);
      else setError(data.error ?? 'Failed to load pricing');
    } catch {
      setError('Network error');
    } finally {
      setLoadingPkg(false);
    }
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
      setSuccess(`Saved — ${overrides.length} custom tier${overrides.length !== 1 ? 's' : ''} set`);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = packages.some(p => p.is_override);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl">Per-Bike Pricing</h1>
        <p className="text-muted text-sm mt-1">
          Override model-default prices for individual bikes. Custom prices take priority at checkout.
          For <strong>Weekly/Monthly flex tiers</strong> set a per-day rate — customers pick their exact days.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_480px] gap-6 items-start">
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
                className={`w-full text-left card p-4 transition-all hover:shadow-md ${isActive ? 'ring-2 ring-accent' : ''}`}
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
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {bike.model.display_name}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isScooter ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isScooter ? '🛵 Scooter' : '🏍️ Bike'}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {bike.color} · {bike.model.cc}cc
                      {bike.registration_number && ` · ${bike.registration_number}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {overrideCount > 0 && (
                      <span className="text-[10px] bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full">
                        {overrideCount} custom
                      </span>
                    )}
                    <span className="text-xs text-accent font-medium">Edit →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Edit panel ── */}
        {editingBike ? (
          <div className="card p-5 lg:sticky lg:top-20 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-primary/5 flex items-center justify-center shrink-0">
                {editingBike.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editingBike.image_url} alt={editingBike.model.display_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">{editingBike.emoji}</span>
                )}
              </div>
              <div>
                <div className="font-semibold">{editingBike.model.display_name}</div>
                <div className="text-xs text-muted flex items-center gap-1">
                  {editingBike.color} · {editingBike.model.cc}cc
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold ${editingBike.model.category === 'scooter' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {editingBike.model.category === 'scooter' ? '🛵 Scooter' : '🏍️ Bike'}
                  </span>
                </div>
              </div>
            </div>

            {loadingPkg ? (
              <div className="space-y-3">
                {TIER_ORDER.map(t => <div key={t} className="h-20 bg-border/30 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map(pkg => {
                  const flex  = isFlexTier(pkg.tier);
                  const range = flex ? FLEX_TIER_RANGES[pkg.tier as 'weekly_flex' | 'monthly_flex'] : null;
                  return (
                    <div
                      key={pkg.tier}
                      className={`p-3 rounded-lg border transition-colors ${pkg.is_override ? 'border-accent/40 bg-accent/5' : 'border-border'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{TIER_LABELS[pkg.tier]}</span>
                          {flex && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded-full">per day</span>
                          )}
                          {pkg.is_override && !flex && (
                            <span className="text-[10px] bg-accent text-white font-bold px-1.5 py-0.5 rounded-full">Custom</span>
                          )}
                        </div>
                        {pkg.is_override && (
                          <button onClick={() => resetTier(pkg.tier)} className="text-[11px] text-muted hover:text-danger underline">Reset</button>
                        )}
                      </div>

                      {flex && range && (
                        <p className="text-[11px] text-muted mb-2 pb-2 border-b border-border">
                          Price = ₹/day × actual days ({range.min}–{range.max}). km limit = km/day × days.
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                            {flex ? '₹ per day' : 'Price (₹)'}
                          </label>
                          <input
                            type="number" min={0} step={1} value={pkg.price}
                            onChange={e => updateField(pkg.tier, 'price', e.target.value)}
                            className="input-field text-sm py-1.5 px-2.5 w-full"
                          />
                          {pkg.is_override && <p className="text-[10px] text-muted mt-0.5">Model: {flex ? `₹${pkg.model_price}/day` : formatINR(pkg.model_price)}</p>}
                        </div>
                        <div>
                          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                            {flex ? 'KM / day' : 'KM Limit'}
                          </label>
                          <input
                            type="number" min={0} step={10} value={pkg.km_limit}
                            onChange={e => updateField(pkg.tier, 'km_limit', e.target.value)}
                            className="input-field text-sm py-1.5 px-2.5 w-full"
                          />
                          {pkg.is_override && <p className="text-[10px] text-muted mt-0.5">Model: {pkg.model_km_limit} km{flex ? '/day' : ''}</p>}
                        </div>
                      </div>

                      {flex && pkg.price > 0 && (
                        <p className="text-[11px] text-muted mt-2 bg-bg px-2 py-1 rounded">
                          e.g. 10 days → {formatINR(pkg.price * 10)} / {pkg.km_limit * 10} km
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {error   && <div className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-2.5">{error}</div>}
            {success && <div className="mt-3 text-xs text-success bg-success/10 border border-success/20 rounded-lg p-2.5">✓ {success}</div>}

            {!loadingPkg && (
              <div className="mt-4 flex gap-2">
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
        ) : (
          <div className="card p-8 text-center text-muted hidden lg:flex flex-col items-center gap-3">
            <div className="text-4xl">💰</div>
            <p className="text-sm">Select a bike from the list to edit its pricing</p>
          </div>
        )}
      </div>
    </div>
  );
}
