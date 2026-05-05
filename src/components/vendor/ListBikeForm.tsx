'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Model = {
  id: string;
  name: string;
  display_name: string;
  category: string;
  cc: number;
};

export function ListBikeForm({ models }: { models: Model[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    model_id: '',
    registration_number: '',
    color: '',
    color_hex: '#1a1a1a',
    year: new Date().getFullYear(),
    emoji: '🏍️',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: any) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const canSubmit = form.model_id && form.color.trim().length >= 2 && form.year >= 2000 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor/bikes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push('/vendor');
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  type VehicleTypeFilter = 'scooter' | 'motorcycle';

  const scooterModels    = models.filter(m => m.category === 'scooter');
  const motorcycleModels = models.filter(m => m.category !== 'scooter');

  const selectedModel = models.find(m => m.id === form.model_id);
  const vehicleTypeFilter: VehicleTypeFilter | null =
    selectedModel ? (selectedModel.category === 'scooter' ? 'scooter' : 'motorcycle') : null;

  const ccGroupLabels: Record<string, string> = {
    bike_sub125: '< 125cc',
    bike_sub150: '125–150cc',
    bike_plus150: '150cc+',
  };
  const motoGrouped = motorcycleModels.reduce<Record<string, Model[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Vehicle type selector — top-level choice */}
      <div className="card p-5">
        <label className="form-label block mb-3">Vehicle type *</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { type: 'scooter'    as VehicleTypeFilter, icon: '🛵', label: 'Scooter', desc: '≤125cc automatic' },
            { type: 'motorcycle' as VehicleTypeFilter, icon: '🏍️', label: 'Motorcycle', desc: '125cc+ manual/sport' },
          ] as const).map(v => {
            const active = vehicleTypeFilter === v.type ||
              (!vehicleTypeFilter && false); // nothing selected yet
            const hasModels = v.type === 'scooter' ? scooterModels.length > 0 : motorcycleModels.length > 0;
            return (
              <button
                key={v.type}
                type="button"
                disabled={!hasModels}
                onClick={() => update('model_id', '')} // reset when switching type
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  active
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="text-2xl mb-1">{v.icon}</div>
                <div className="font-semibold text-sm">{v.label}</div>
                <div className="text-[11px] text-muted mt-0.5">{v.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <label className="form-label">Select model *</label>
        <p className="text-xs text-muted mt-1 mb-3">
          The model determines pricing. All prices follow Zodito&apos;s master rate card.
        </p>

        {/* Scooter models */}
        {scooterModels.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span>🛵</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Scooters</span>
            </div>
            <div className="space-y-1.5">
              {scooterModels.map(m => (
                <label key={m.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${form.model_id === m.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
                  <input type="radio" name="model" value={m.id} checked={form.model_id === m.id} onChange={() => update('model_id', m.id)} className="accent-accent" />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{m.display_name}</div>
                    <div className="text-[11px] text-muted">{m.cc}cc · Automatic</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Motorcycle models grouped by CC */}
        {motorcycleModels.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span>🏍️</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Motorcycles</span>
            </div>
            <div className="space-y-4">
              {Object.entries(motoGrouped).map(([category, catModels]) => (
                <div key={category}>
                  <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 pl-1">
                    {ccGroupLabels[category] ?? category}
                  </div>
                  <div className="space-y-1.5">
                    {catModels.map(m => (
                      <label key={m.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${form.model_id === m.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
                        <input type="radio" name="model" value={m.id} checked={form.model_id === m.id} onChange={() => update('model_id', m.id)} className="accent-accent" />
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{m.display_name}</div>
                          <div className="text-[11px] text-muted">{m.cc}cc</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-display font-semibold text-base">Bike details</h3>

        <Field label="Registration number">
          <input
            value={form.registration_number}
            onChange={e => update('registration_number', e.target.value.toUpperCase())}
            className="input-field"
            placeholder="e.g. TS 09 EC 1234"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Color *">
            <input
              value={form.color}
              onChange={e => update('color', e.target.value)}
              className="input-field"
              placeholder="e.g. Racing Red"
            />
          </Field>
          <Field label="Color swatch">
            <input
              type="color"
              value={form.color_hex}
              onChange={e => update('color_hex', e.target.value)}
              className="input-field h-[42px] cursor-pointer"
            />
          </Field>
        </div>

        <Field label="Year *">
          <input
            type="number"
            value={form.year}
            onChange={e => update('year', parseInt(e.target.value) || 0)}
            className="input-field"
            min={2000}
            max={new Date().getFullYear() + 1}
          />
        </Field>

        <Field label="Icon">
          <div className="flex gap-2 flex-wrap">
            {['🛵', '🏍️', '🏁'].map(em => (
              <button
                key={em}
                onClick={() => update('emoji', em)}
                className={`text-3xl p-2 rounded-lg border transition-all ${
                  form.emoji === em ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      <div className="p-4 bg-info/5 border border-info/20 rounded-card text-xs">
        <div className="font-semibold text-info mb-1">📋 What happens next?</div>
        <div className="text-muted">
          Your listing will go into review. Admin approves within 24 hrs. Once approved,
          customers can book and you&apos;ll get notified.
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="btn-accent w-full text-base py-3 disabled:bg-border disabled:text-muted disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
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
