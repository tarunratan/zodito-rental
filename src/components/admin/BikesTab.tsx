'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Model = { id: string; name: string; display_name: string; category: string; cc: number };
type Bike = {
  id: string;
  model_id: string;
  owner_type: string;
  listing_status: string;
  is_active: boolean;
  registration_number: string | null;
  color: string | null;
  color_hex: string | null;
  year: number | null;
  emoji: string;
  image_url: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  rejection_reason: string | null;
  created_at: string;
  model: { id: string; display_name: string; name?: string; category: string; cc: number } | null;
  vendor: { id?: string; business_name: string; pickup_area?: string } | null;
};

const STATUS_PILL: Record<string, string> = {
  approved:         'bg-success/10 text-success',
  pending_approval: 'bg-warning/10 text-warning',
  rejected:         'bg-danger/10 text-danger',
  draft:            'bg-muted/10 text-muted',
  inactive:         'bg-border text-muted',
};

const CAT_LABELS: Record<string, string> = {
  scooter:      'Scooters (≤125cc)',
  bike_sub150:  '125–150cc',
  bike_plus150: '150cc+',
};

function emojiForCategory(cat: string) {
  return cat === 'scooter' ? '🛵' : cat === 'bike_plus150' ? '🏁' : '🏍️';
}

const EMPTY_BIKE_FORM = {
  model_id:            '',
  registration_number: '',
  color:               '',
  year:                new Date().getFullYear(),
  notes:               '',
  image_url:   null as string | null,
  image_url_2: null as string | null,
  image_url_3: null as string | null,
};

const EMPTY_MODEL_FORM = {
  display_name: '',
  category:     'scooter' as 'scooter' | 'bike_sub150' | 'bike_plus150',
  cc:           110,
  price_12hr:   349,
  price_24hr:   499,
  price_7day:   2200,
};

export function BikesTab({
  pendingBikes,
  allBikes,
  models: initialModels,
}: {
  pendingBikes: Bike[];
  allBikes: Bike[];
  models: Model[];
}) {
  const router = useRouter();

  // local models list so newly created models appear without a page reload
  const [models, setModels]       = useState<Model[]>(initialModels);

  const [subTab, setSubTab]       = useState<'all' | 'pending'>('all');
  const [showForm, setShowForm]   = useState(false);
  const [editBike, setEditBike]   = useState<Bike | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_BIKE_FORM });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New-model inline panel state
  const [showNewModel, setShowNewModel]       = useState(false);
  const [modelForm, setModelForm]             = useState({ ...EMPTY_MODEL_FORM });
  const [savingModel, setSavingModel]         = useState(false);
  const [modelError, setModelError]           = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm]     = useState<string | null>(null);
  const [rejectTarget, setRejectTarget]       = useState<string | null>(null);
  const [rejectReason, setRejectReason]       = useState('');

  const selectedModel = models.find(m => m.id === form.model_id) ?? null;

  function upd<K extends keyof typeof form>(k: K, v: any) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function updModel<K extends keyof typeof modelForm>(k: K, v: any) {
    setModelForm(f => ({ ...f, [k]: v }));
  }

  function openAdd() {
    setEditBike(null);
    setForm({ ...EMPTY_BIKE_FORM });
    setFormError(null);
    setShowNewModel(false);
    setShowForm(true);
  }

  function openEdit(bike: Bike) {
    setEditBike(bike);
    setForm({
      model_id:            bike.model_id,
      registration_number: bike.registration_number ?? '',
      color:               bike.color ?? '',
      year:                bike.year ?? new Date().getFullYear(),
      notes:               '',
      image_url:   bike.image_url,
      image_url_2: bike.image_url_2,
      image_url_3: bike.image_url_3,
    });
    setFormError(null);
    setShowNewModel(false);
    setShowForm(true);
  }

  async function saveNewModel() {
    if (!modelForm.display_name.trim() || !modelForm.cc) {
      setModelError('Name and CC are required.');
      return;
    }
    setSavingModel(true);
    setModelError(null);
    try {
      const res = await fetch('/api/admin/models', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(modelForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Add new model to local list and auto-select it
      const newModel: Model = data.model;
      setModels(prev => [...prev, newModel]);
      upd('model_id', newModel.id);
      setShowNewModel(false);
      setModelForm({ ...EMPTY_MODEL_FORM });
    } catch (e: any) {
      setModelError(e.message);
    } finally {
      setSavingModel(false);
    }
  }

  async function saveBike() {
    if (!form.model_id || !form.color.trim()) {
      setFormError('Model and color are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const emoji = selectedModel ? emojiForCategory(selectedModel.category) : '🏍️';
      const payload = {
        model_id:            form.model_id,
        registration_number: form.registration_number.trim() || null,
        color:               form.color.trim(),
        color_hex:           null,
        year:                form.year,
        emoji,
        image_url:   form.image_url,
        image_url_2: form.image_url_2,
        image_url_3: form.image_url_3,
      };
      const url    = editBike ? `/api/admin/bikes/${editBike.id}` : '/api/admin/bikes';
      const method = editBike ? 'PATCH' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setShowForm(false);
      router.refresh();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBike(id: string) {
    await fetch(`/api/admin/bikes/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    router.refresh();
  }

  async function reviewBike(bike_id: string, action: 'approve' | 'reject', reason?: string) {
    await fetch('/api/admin/bikes/review', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bike_id, action, reason: reason || null }),
    });
    setRejectTarget(null);
    setRejectReason('');
    router.refresh();
  }

  const displayBikes = subTab === 'pending' ? pendingBikes : allBikes;

  // Group models by category for the select
  const grouped = models.reduce<Record<string, Model[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  // Default price hints based on selected category
  const priceSuggestions: Record<string, { p12: number; p24: number; p7: number }> = {
    scooter:      { p12: 349,  p24: 499,  p7: 2200 },
    bike_sub150:  { p12: 499,  p24: 799,  p7: 3000 },
    bike_plus150: { p12: 799,  p24: 1299, p7: 5999 },
  };

  function onCategoryChange(cat: 'scooter' | 'bike_sub150' | 'bike_plus150') {
    const s = priceSuggestions[cat];
    setModelForm(f => ({ ...f, category: cat, price_12hr: s.p12, price_24hr: s.p24, price_7day: s.p7 }));
  }

  const canSaveBike = !!form.model_id && form.color.trim().length >= 2 && !saving;

  return (
    <div>
      {/* Sub-tabs + Add button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm">
          {(['all', 'pending'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                subTab === t ? 'bg-accent text-white' : 'text-muted hover:text-primary'
              }`}
            >
              {t === 'all' ? `All (${allBikes.length})` : `Pending (${pendingBikes.length})`}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="btn-accent text-sm px-4 py-2">+ Add Bike</button>
      </div>

      {/* Bike list */}
      {displayBikes.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <div className="text-4xl mb-2">✨</div>
          <p className="text-sm">
            {subTab === 'pending' ? 'No pending bikes to review' : 'No bikes yet — add your first one'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayBikes.map(bike => (
            <div key={bike.id} className="card p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center shrink-0">
                  {bike.image_url
                    ? <img src={bike.image_url} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                    : <span className="text-3xl">{bike.emoji}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{bike.model?.display_name ?? '—'}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[bike.listing_status] ?? ''}`}>
                      {bike.listing_status.replace('_', ' ')}
                    </span>
                    {bike.owner_type === 'platform' && (
                      <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Zodito Fleet</span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-2">
                    {bike.color && <span>{bike.color}</span>}
                    {bike.year && <span>· {bike.year}</span>}
                    {bike.registration_number && <span>· {bike.registration_number}</span>}
                    {bike.vendor && <span>· {bike.vendor.business_name}</span>}
                    {bike.model?.cc && <span>· {bike.model.cc}cc</span>}
                  </div>
                  {bike.listing_status === 'rejected' && bike.rejection_reason && (
                    <p className="text-xs text-danger mt-1">Reason: {bike.rejection_reason}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {bike.listing_status === 'pending_approval' && (
                    <>
                      <button onClick={() => reviewBike(bike.id, 'approve')} className="text-xs px-3 py-1.5 bg-success/10 text-success rounded-lg hover:bg-success/20 font-medium">Approve</button>
                      <button onClick={() => { setRejectTarget(bike.id); setRejectReason(''); }} className="text-xs px-3 py-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 font-medium">Reject</button>
                    </>
                  )}
                  <button onClick={() => openEdit(bike)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-border/50 font-medium">Edit</button>
                  <button onClick={() => setDeleteConfirm(bike.id)} className="text-xs px-3 py-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 font-medium">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-lg">{editBike ? 'Edit Bike' : 'Add New Bike'}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

              {/* ── Model select ───────────────────────── */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Model <span className="text-danger">*</span>
                </label>
                <select
                  value={form.model_id}
                  onChange={e => { upd('model_id', e.target.value); setShowNewModel(false); }}
                  className="input-field"
                >
                  <option value="">Select a model…</option>
                  {Object.entries(grouped).map(([cat, catModels]) => (
                    <optgroup key={cat} label={CAT_LABELS[cat] ?? cat}>
                      {catModels.map(m => (
                        <option key={m.id} value={m.id}>{m.display_name} ({m.cc}cc)</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {selectedModel && !showNewModel && (
                  <p className="text-xs text-muted mt-1.5">
                    {CAT_LABELS[selectedModel.category]} · {selectedModel.cc}cc · pricing follows Zodito rate card
                  </p>
                )}

                {/* Toggle new-model panel */}
                {!showNewModel ? (
                  <button
                    type="button"
                    onClick={() => { setShowNewModel(true); setModelError(null); setModelForm({ ...EMPTY_MODEL_FORM }); }}
                    className="mt-2 text-xs text-accent hover:underline font-medium"
                  >
                    + Model not listed? Add it here
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewModel(false)}
                    className="mt-2 text-xs text-muted hover:text-primary"
                  >
                    ✕ Cancel new model
                  </button>
                )}
              </div>

              {/* ── Inline new-model panel ─────────────── */}
              {showNewModel && (
                <div className="bg-bg rounded-xl border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">New model details</p>

                  <div>
                    <label className="block text-xs font-medium mb-1">Model name <span className="text-danger">*</span></label>
                    <input
                      value={modelForm.display_name}
                      onChange={e => updModel('display_name', e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. TVS Apache RTR 160, Honda CB300R"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Category <span className="text-danger">*</span></label>
                      <select
                        value={modelForm.category}
                        onChange={e => onCategoryChange(e.target.value as any)}
                        className="input-field text-sm"
                      >
                        <option value="scooter">Scooter (≤125cc)</option>
                        <option value="bike_sub150">125–150cc</option>
                        <option value="bike_plus150">150cc+</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Engine CC <span className="text-danger">*</span></label>
                      <input
                        type="number"
                        value={modelForm.cc}
                        onChange={e => updModel('cc', parseInt(e.target.value) || 0)}
                        className="input-field text-sm"
                        placeholder="160"
                        min={50}
                        max={2000}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Rental pricing (₹)</label>
                    <p className="text-[11px] text-muted mb-2">Set your prices — 15-day and 30-day are auto-calculated from 7-day.</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[11px] text-muted mb-1">12 hrs</p>
                        <input type="number" value={modelForm.price_12hr} onChange={e => updModel('price_12hr', parseInt(e.target.value) || 0)} className="input-field text-sm" min={1} />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted mb-1">24 hrs</p>
                        <input type="number" value={modelForm.price_24hr} onChange={e => updModel('price_24hr', parseInt(e.target.value) || 0)} className="input-field text-sm" min={1} />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted mb-1">7 days</p>
                        <input type="number" value={modelForm.price_7day} onChange={e => updModel('price_7day', parseInt(e.target.value) || 0)} className="input-field text-sm" min={1} />
                      </div>
                    </div>
                  </div>

                  {modelError && <p className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">{modelError}</p>}

                  <button
                    type="button"
                    onClick={saveNewModel}
                    disabled={savingModel || !modelForm.display_name.trim() || !modelForm.cc}
                    className="btn-accent w-full text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingModel ? 'Creating model…' : 'Create model & select it'}
                  </button>
                </div>
              )}

              {/* ── Bike details ───────────────────────── */}
              <div>
                <label className="block text-sm font-medium mb-1">Color <span className="text-danger">*</span></label>
                <input
                  value={form.color}
                  onChange={e => upd('color', e.target.value)}
                  className="input-field"
                  placeholder="e.g. Pearl White, Matte Black, Candy Red"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Registration no.</label>
                  <input
                    value={form.registration_number}
                    onChange={e => upd('registration_number', e.target.value.toUpperCase())}
                    className="input-field"
                    placeholder="TS 09 EC 1234"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Year <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={e => upd('year', parseInt(e.target.value) || 0)}
                    className="input-field"
                    min={2000}
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Photos</label>
                <p className="text-xs text-muted mb-2">First photo is the cover shown on listings.</p>
                <div className="grid grid-cols-3 gap-2">
                  <ImageUpload label="Cover" url={form.image_url}   onUploaded={url => upd('image_url',   url)} onRemoved={() => upd('image_url',   null)} />
                  <ImageUpload label="Photo 2" url={form.image_url_2} onUploaded={url => upd('image_url_2', url)} onRemoved={() => upd('image_url_2', null)} />
                  <ImageUpload label="Photo 3" url={form.image_url_3} onUploaded={url => upd('image_url_3', url)} onRemoved={() => upd('image_url_3', null)} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes <span className="text-muted font-normal text-xs">(internal, optional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={e => upd('notes', e.target.value)}
                  className="input-field h-16 resize-none"
                  placeholder="e.g. Minor scratch on left panel, serviced Jan 2025"
                />
              </div>

              {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted">
                {editBike ? 'Changes go live immediately.' : 'Goes live immediately as Zodito Fleet.'}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
                <button
                  onClick={saveBike}
                  disabled={!canSaveBike}
                  className="btn-accent px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : editBike ? 'Save changes' : 'Add bike'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ─────────────────────────────────── */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Reason for rejection</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="input-field h-20 resize-none" placeholder="Shown to the vendor (optional)" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
              <button onClick={() => reviewBike(rejectTarget, 'reject', rejectReason)} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Delete bike?</h3>
            <p className="text-sm text-muted">This permanently removes the bike and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
              <button onClick={() => deleteBike(deleteConfirm)} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline image uploader ───────────────────────────────────────────────────

function ImageUpload({ label, url, onUploaded, onRemoved }: { label: string; url: string | null; onUploaded: (u: string) => void; onRemoved: () => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const supabase = createSupabaseBrowser();
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from('bikes').upload(path, file);
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('bikes').getPublicUrl(data.path);
      onUploaded(publicUrl);
    } else {
      alert('Upload failed: ' + (error?.message ?? 'unknown'));
    }
    setUploading(false);
    e.target.value = '';
  }

  return (
    <div>
      <p className="text-[11px] text-muted mb-1">{label}</p>
      <div
        className="relative border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-accent/50 transition-colors"
        style={{ height: 80 }}
        onClick={() => !url && ref.current?.click()}
      >
        {url ? (
          <>
            <img src={url} alt="" className="w-full h-full object-cover" /> {/* eslint-disable-line @next/next/no-img-element */}
            <button type="button" onClick={e => { e.stopPropagation(); onRemoved(); }}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none">
              ✕
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-0.5 select-none">
            {uploading ? <span>Uploading…</span> : <><span className="text-lg">📷</span><span>Upload</span></>}
          </div>
        )}
        {uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><span className="text-xs font-medium">Uploading…</span></div>}
      </div>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
