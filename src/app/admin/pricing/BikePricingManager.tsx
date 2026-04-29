'use client';

import { useState } from 'react';
import { TIER_LABELS } from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';

type Bike = any;

const TIERS: PackageTier[] = ['6hr', '12hr', '24hr', '7day', '15day', '30day'];

type PkgRow = {
  tier: PackageTier;
  price: number;
  km_limit: number;
  is_override: boolean;
  model_price: number;
  model_km_limit: number;
};

export function BikePricingManager({ initialBikes }: { initialBikes: Bike[] }) {
  const [bikes, setBikes] = useState<Bike[]>(initialBikes);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [packages, setPackages] = useState<PkgRow[]>([]);
  const [loadingPkg, setLoadingPkg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function openEditor(bike: Bike) {
    setEditingBike(bike);
    setError(null);
    setSuccess(null);
    setLoadingPkg(true);
    try {
      const res = await fetch(`/api/admin/bikes/${bike.id}/packages`);
      const data = await res.json();
      if (res.ok) {
        setPackages(data.packages);
      } else {
        setError(data.error ?? 'Failed to load pricing');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoadingPkg(false);
    }
  }

  function updateField(tier: PackageTier, field: 'price' | 'km_limit', raw: string) {
    const val = field === 'price' ? parseFloat(raw) : parseInt(raw, 10);
    if (isNaN(val) || val < 0) return;
    setPackages(prev =>
      prev.map(p => p.tier === tier ? { ...p, [field]: val, is_override: true } : p)
    );
  }

  function resetTier(tier: PackageTier) {
    setPackages(prev =>
      prev.map(p =>
        p.tier === tier
          ? { ...p, price: p.model_price, km_limit: p.model_km_limit, is_override: false }
          : p
      )
    );
  }

  function resetAll() {
    setPackages(prev =>
      prev.map(p => ({ ...p, price: p.model_price, km_limit: p.model_km_limit, is_override: false }))
    );
  }

  async function save() {
    if (!editingBike) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const overrides = packages
        .filter(p => p.is_override)
        .map(p => ({ tier: p.tier, price: p.price, km_limit: p.km_limit }));

      const res = await fetch(`/api/admin/bikes/${editingBike.id}/packages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: overrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }

      // Update the bike's override count in the list
      setBikes(prev =>
        prev.map(b =>
          b.id === editingBike.id
            ? { ...b, bike_packages: overrides }
            : b
        )
      );
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
          Override model-default prices for individual bikes. Custom prices take priority over model defaults at checkout.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_440px] gap-6 items-start">
        {/* ── Bike list ── */}
        <div className="space-y-3">
          {bikes.length === 0 && (
            <p className="text-muted text-sm py-8 text-center">No active bikes found.</p>
          )}
          {bikes.map(bike => {
            const overrideCount = (bike.bike_packages ?? []).length;
            const isActive = editingBike?.id === bike.id;
            return (
              <button
                key={bike.id}
                onClick={() => openEditor(bike)}
                className={`w-full text-left card p-4 transition-all hover:shadow-md ${
                  isActive ? 'ring-2 ring-accent' : ''
                }`}
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
                    <div className="font-semibold text-sm">{bike.model.display_name}</div>
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

                {/* Mini price preview */}
                <div className="mt-2 flex gap-3 flex-wrap">
                  {(bike.model.packages ?? []).map((mp: any) => {
                    const ov = (bike.bike_packages ?? []).find((bp: any) => bp.tier === mp.tier);
                    return (
                      <span key={mp.tier} className="text-[11px] text-muted">
                        <span className="font-medium text-primary">
                          ₹{ov ? Number(ov.price).toLocaleString('en-IN') : Number(mp.price).toLocaleString('en-IN')}
                        </span>
                        {' '}/{' '}
                        <span>{TIER_LABELS[mp.tier as PackageTier]}</span>
                        {ov && <span className="text-accent font-bold ml-1">✎</span>}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Edit panel ── */}
        {editingBike ? (
          <div className="card p-5 lg:sticky lg:top-20">
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
                <div className="text-xs text-muted">{editingBike.color} · {editingBike.model.cc}cc</div>
              </div>
            </div>

            {loadingPkg ? (
              <div className="space-y-3">
                {TIERS.map(t => <div key={t} className="h-20 bg-border/30 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map(pkg => (
                  <div
                    key={pkg.tier}
                    className={`p-3 rounded-lg border transition-colors ${
                      pkg.is_override ? 'border-accent/40 bg-accent/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{TIER_LABELS[pkg.tier]}</span>
                        {pkg.is_override && (
                          <span className="text-[10px] bg-accent text-white font-bold px-1.5 py-0.5 rounded-full leading-none">
                            Custom
                          </span>
                        )}
                      </div>
                      {pkg.is_override && (
                        <button
                          onClick={() => resetTier(pkg.tier)}
                          className="text-[11px] text-muted hover:text-danger underline transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                          Price (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={pkg.price}
                          onChange={e => updateField(pkg.tier, 'price', e.target.value)}
                          className="input-field text-sm py-1.5 px-2.5 w-full"
                        />
                        {pkg.is_override && (
                          <p className="text-[10px] text-muted mt-0.5">Model: ₹{pkg.model_price}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
                          KM Limit
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={pkg.km_limit}
                          onChange={e => updateField(pkg.tier, 'km_limit', e.target.value)}
                          className="input-field text-sm py-1.5 px-2.5 w-full"
                        />
                        {pkg.is_override && (
                          <p className="text-[10px] text-muted mt-0.5">Model: {pkg.model_km_limit} km</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-2.5">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-3 text-xs text-success bg-success/10 border border-success/20 rounded-lg p-2.5">
                ✓ {success}
              </div>
            )}

            {!loadingPkg && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-accent flex-1 py-2.5 text-sm disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Pricing'}
                </button>
                {hasOverride && (
                  <button
                    onClick={resetAll}
                    disabled={saving}
                    className="px-3 py-2.5 border border-border rounded-xl text-sm text-muted hover:text-danger hover:border-danger transition-colors"
                    title="Reset all tiers back to model defaults"
                  >
                    Reset all
                  </button>
                )}
              </div>
            )}

            {!loadingPkg && (
              <p className="text-[10px] text-muted mt-3 leading-relaxed">
                Changing a value marks it as custom. Click <strong>Reset</strong> on a tier to revert it to the model default. <strong>Reset all</strong> clears every override for this bike.
              </p>
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
