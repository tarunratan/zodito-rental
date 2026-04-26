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
  approved: 'bg-success/10 text-success',
  pending_approval: 'bg-warning/10 text-warning',
  rejected: 'bg-danger/10 text-danger',
  draft: 'bg-muted/10 text-muted',
  inactive: 'bg-border text-muted',
};

const EMPTY_FORM = {
  model_id: '',
  registration_number: '',
  color: '',
  color_hex: '#1a1a1a',
  year: new Date().getFullYear(),
  emoji: '🏍️',
  image_url: null as string | null,
  image_url_2: null as string | null,
  image_url_3: null as string | null,
};

export function BikesTab({ pendingBikes, allBikes, models }: { pendingBikes: Bike[]; allBikes: Bike[]; models: Model[] }) {
  const router = useRouter();
  const [subTab, setSubTab] = useState<'all' | 'pending'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editBike, setEditBike] = useState<Bike | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  function upd<K extends keyof typeof form>(k: K, v: any) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function openAdd() {
    setEditBike(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(bike: Bike) {
    setEditBike(bike);
    setForm({
      model_id: bike.model_id,
      registration_number: bike.registration_number ?? '',
      color: bike.color ?? '',
      color_hex: bike.color_hex ?? '#1a1a1a',
      year: bike.year ?? new Date().getFullYear(),
      emoji: bike.emoji,
      image_url: bike.image_url,
      image_url_2: bike.image_url_2,
      image_url_3: bike.image_url_3,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function saveBike() {
    if (!form.model_id || !form.color.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form, registration_number: form.registration_number || null };
      const url = editBike ? `/api/admin/bikes/${editBike.id}` : '/api/admin/bikes';
      const res = await fetch(url, {
        method: editBike ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bike_id, action, reason: reason || null }),
    });
    setRejectTarget(null);
    setRejectReason('');
    router.refresh();
  }

  const displayBikes = subTab === 'pending' ? pendingBikes : allBikes;

  const grouped = models.reduce<Record<string, Model[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  const catLabels: Record<string, string> = {
    scooter: 'Scooters',
    bike_sub150: '125–150cc',
    bike_plus150: '150cc+',
  };

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
          <p className="text-sm">{subTab === 'pending' ? 'No pending bikes to review' : 'No bikes yet — add your first one'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayBikes.map(bike => (
            <div key={bike.id} className="card p-4">
              <div className="flex items-center gap-4">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center shrink-0">
                  {bike.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bike.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{bike.emoji}</span>
                  )}
                </div>

                {/* Info */}
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
                  <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                    {bike.color_hex && (
                      <span className="w-2.5 h-2.5 rounded-full border border-border inline-block" style={{ backgroundColor: bike.color_hex }} />
                    )}
                    <span>{bike.color ?? '—'}</span>
                    {bike.year && <span>· {bike.year}</span>}
                    {bike.registration_number && <span>· {bike.registration_number}</span>}
                    {bike.vendor && <span>· {bike.vendor.business_name}</span>}
                  </div>
                  {bike.listing_status === 'rejected' && bike.rejection_reason && (
                    <p className="text-xs text-danger mt-1">Rejected: {bike.rejection_reason}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {bike.listing_status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => reviewBike(bike.id, 'approve')}
                        className="text-xs px-3 py-1.5 bg-success/10 text-success rounded-lg hover:bg-success/20 font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(bike.id); setRejectReason(''); }}
                        className="text-xs px-3 py-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 font-medium"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => openEdit(bike)}
                    className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-border/50 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(bike.id)}
                    className="text-xs px-3 py-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-lg">{editBike ? 'Edit Bike' : 'Add New Bike'}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Model picker */}
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Model *</p>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([cat, catModels]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">{catLabels[cat] ?? cat}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {catModels.map(m => (
                          <label
                            key={m.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-all ${
                              form.model_id === m.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                            }`}
                          >
                            <input type="radio" name="form_model" checked={form.model_id === m.id} onChange={() => upd('model_id', m.id)} className="accent-accent" />
                            <span className="font-medium">{m.display_name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-muted mb-1">Color *</p>
                  <input value={form.color} onChange={e => upd('color', e.target.value)} className="input-field" placeholder="Matte Black" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted mb-1">Swatch</p>
                  <input type="color" value={form.color_hex} onChange={e => upd('color_hex', e.target.value)} className="input-field h-[38px] p-1 cursor-pointer" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-muted mb-1">Registration</p>
                  <input value={form.registration_number} onChange={e => upd('registration_number', e.target.value.toUpperCase())} className="input-field" placeholder="TS 09 EC 1234" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted mb-1">Year *</p>
                  <input type="number" value={form.year} onChange={e => upd('year', parseInt(e.target.value) || 0)} className="input-field" min={2000} max={new Date().getFullYear() + 1} />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted mb-1">Icon</p>
                <div className="flex gap-2">
                  {['🛵', '🏍️', '🏁'].map(em => (
                    <button key={em} type="button" onClick={() => upd('emoji', em)}
                      className={`text-2xl p-2 rounded-lg border transition-all ${form.emoji === em ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Images */}
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Photos (up to 3)</p>
                <div className="grid grid-cols-3 gap-2">
                  <ImageUpload label="Cover" url={form.image_url} onUploaded={url => upd('image_url', url)} onRemoved={() => upd('image_url', null)} />
                  <ImageUpload label="Photo 2" url={form.image_url_2} onUploaded={url => upd('image_url_2', url)} onRemoved={() => upd('image_url_2', null)} />
                  <ImageUpload label="Photo 3" url={form.image_url_3} onUploaded={url => upd('image_url_3', url)} onRemoved={() => upd('image_url_3', null)} />
                </div>
              </div>

              {formError && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{formError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
              <button
                onClick={saveBike}
                disabled={!form.model_id || !form.color.trim() || saving}
                className="btn-accent px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : editBike ? 'Save changes' : 'Add bike'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Reason for rejection</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="input-field h-20 resize-none"
              placeholder="Shown to the vendor (optional)"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-border/50">Cancel</button>
              <button onClick={() => reviewBike(rejectTarget, 'reject', rejectReason)} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
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
    const ext = file.name.split('.').pop() ?? 'jpg';
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
      <p className="text-xs text-muted mb-1">{label}</p>
      <div
        className="relative border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-accent/50 transition-colors"
        style={{ height: 80 }}
        onClick={() => !url && ref.current?.click()}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onRemoved(); }}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
            >✕</button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-0.5 select-none">
            {uploading ? <span>Uploading…</span> : <><span className="text-lg">📷</span><span>Upload</span></>}
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
