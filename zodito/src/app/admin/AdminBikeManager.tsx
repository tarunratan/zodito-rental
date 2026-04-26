'use client';

import { useState } from 'react';
import { ImageUpload } from '@/components/shared/ImageUpload';

type Model = { id: string; display_name: string; name: string; category: string; cc: number };
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
  frozen_from: string | null;
  frozen_until: string | null;
  freeze_reason: string | null;
  created_at: string;
  model: Model | null;
  vendor: { id: string; business_name: string; pickup_area: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
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

export function AdminBikeManager({ initialBikes, models }: { initialBikes: Bike[]; models: Model[] }) {
  const [bikes, setBikes] = useState<Bike[]>(initialBikes);
  const [showForm, setShowForm] = useState(false);
  const [editBike, setEditBike] = useState<Bike | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [freezeModal, setFreezeModal] = useState<{ id: string; name: string; frozen: boolean } | null>(null);
  const [freezeForm, setFreezeForm] = useState({ frozen_from: '', frozen_until: '', freeze_reason: '' });

  function upd<K extends keyof typeof form>(k: K, v: any) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function openAdd() {
    setEditBike(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
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
    setError(null);
    setShowForm(true);
  }

  async function saveBike() {
    if (!form.model_id || !form.color.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        registration_number: form.registration_number || null,
        color_hex: form.color_hex || null,
      };
      const url = editBike ? `/api/admin/bikes/${editBike.id}` : '/api/admin/bikes';
      const method = editBike ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refreshBikes();
      setShowForm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBike(id: string) {
    const res = await fetch(`/api/admin/bikes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setBikes(b => b.filter(x => x.id !== id));
    }
    setDeleteConfirm(null);
  }

  async function review(bike_id: string, action: 'approve' | 'reject', reason?: string) {
    const res = await fetch('/api/admin/bikes/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bike_id, action, reason: reason || null }),
    });
    if (res.ok) await refreshBikes();
    setRejectModal(null);
    setRejectReason('');
  }

  async function toggleFreeze(bike_id: string, unfreeze: boolean) {
    const body = unfreeze
      ? { unfreeze: true }
      : {
          frozen_from: freezeForm.frozen_from || new Date().toISOString(),
          frozen_until: freezeForm.frozen_until,
          freeze_reason: freezeForm.freeze_reason,
        };
    const res = await fetch(`/api/admin/bikes/${bike_id}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) await refreshBikes();
    setFreezeModal(null);
    setFreezeForm({ frozen_from: '', frozen_until: '', freeze_reason: '' });
  }

  async function refreshBikes() {
    const res = await fetch('/api/admin/bikes');
    const data = await res.json();
    if (data.bikes) setBikes(data.bikes);
  }

  const grouped = models.reduce<Record<string, Model[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  const catLabels: Record<string, string> = {
    scooter: 'Scooters',
    bike_sub150: '125–150cc',
    bike_plus150: '150cc+',
  };

  const pendingCount = bikes.filter(b => b.listing_status === 'pending_approval').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-lg">Bikes</h2>
          {pendingCount > 0 && (
            <span className="bg-warning text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
          <span className="text-sm text-muted">{bikes.length} total</span>
        </div>
        <button onClick={openAdd} className="btn-accent text-sm px-4 py-2">
          + Add Bike
        </button>
      </div>

      {/* Bike table */}
      <div className="card overflow-hidden">
        {bikes.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">No bikes yet. Add your first bike.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted uppercase tracking-wide">Bike</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted uppercase tracking-wide">Reg</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted uppercase tracking-wide">Owner</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bikes.map(bike => (
                  <tr key={bike.id} className="border-b border-border last:border-0 hover:bg-bg/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center shrink-0">
                          {bike.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={bike.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">{bike.emoji}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold">{bike.model?.display_name ?? '—'}</div>
                          <div className="text-xs text-muted flex items-center gap-1.5">
                            {bike.color_hex && (
                              <span className="w-2.5 h-2.5 rounded-full border border-border inline-block" style={{ backgroundColor: bike.color_hex }} />
                            )}
                            {bike.color ?? '—'} {bike.year ? `• ${bike.year}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{bike.registration_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {bike.owner_type === 'vendor' ? (
                        <div>
                          <div className="text-xs font-medium">{bike.vendor?.business_name ?? 'Vendor'}</div>
                          <div className="text-[11px] text-muted">{bike.vendor?.pickup_area ?? ''}</div>
                        </div>
                      ) : (
                        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Zodito Fleet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit ${STATUS_COLORS[bike.listing_status] ?? ''}`}>
                          {bike.listing_status.replace('_', ' ')}
                        </span>
                        {bike.frozen_until && new Date(bike.frozen_until) > new Date() && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit bg-info/10 text-info">
                            🔒 frozen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {bike.listing_status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => review(bike.id, 'approve')}
                              className="text-xs px-2 py-1 bg-success/10 text-success rounded hover:bg-success/20 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setRejectModal({ id: bike.id }); setRejectReason(''); }}
                              className="text-xs px-2 py-1 bg-danger/10 text-danger rounded hover:bg-danger/20 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => openEdit(bike)}
                          className="text-xs px-2 py-1 bg-border text-primary rounded hover:bg-border/70 transition-colors"
                        >
                          Edit
                        </button>
                        {bike.listing_status === 'approved' && (
                          bike.frozen_until && new Date(bike.frozen_until) > new Date() ? (
                            <button
                              onClick={() => toggleFreeze(bike.id, true)}
                              className="text-xs px-2 py-1 bg-success/10 text-success rounded hover:bg-success/20 transition-colors"
                            >
                              Unfreeze
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
                                setFreezeForm({ frozen_from: today, frozen_until: nextWeek + 'T23:59', freeze_reason: '' });
                                setFreezeModal({ id: bike.id, name: bike.model?.display_name ?? 'Bike', frozen: false });
                              }}
                              className="text-xs px-2 py-1 bg-info/10 text-info rounded hover:bg-info/20 transition-colors"
                            >
                              Freeze
                            </button>
                          )
                        )}
                        <button
                          onClick={() => setDeleteConfirm(bike.id)}
                          className="text-xs px-2 py-1 bg-danger/10 text-danger rounded hover:bg-danger/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-lg">{editBike ? 'Edit Bike' : 'Add New Bike'}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Model select */}
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Model *</label>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([cat, catModels]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">{catLabels[cat] ?? cat}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {catModels.map(m => (
                          <label
                            key={m.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-all ${
                              form.model_id === m.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name="admin_model"
                              checked={form.model_id === m.id}
                              onChange={() => upd('model_id', m.id)}
                              className="accent-accent"
                            />
                            <span className="font-medium text-xs">{m.display_name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Color *</label>
                  <input
                    value={form.color}
                    onChange={e => upd('color', e.target.value)}
                    className="input-field w-full"
                    placeholder="e.g. Matte Black"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Color swatch</label>
                  <input
                    type="color"
                    value={form.color_hex}
                    onChange={e => upd('color_hex', e.target.value)}
                    className="input-field w-full h-[38px] cursor-pointer p-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Registration</label>
                  <input
                    value={form.registration_number}
                    onChange={e => upd('registration_number', e.target.value.toUpperCase())}
                    className="input-field w-full"
                    placeholder="TS 09 EC 1234"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Year *</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={e => upd('year', parseInt(e.target.value) || 0)}
                    className="input-field w-full"
                    min={2000}
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted block mb-1">Icon</label>
                <div className="flex gap-2">
                  {['🛵', '🏍️', '🏁'].map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => upd('emoji', em)}
                      className={`text-2xl p-2 rounded-lg border transition-all ${form.emoji === em ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Images */}
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Photos (up to 3)</label>
                <div className="grid grid-cols-3 gap-2">
                  <ImageUpload
                    label="Cover"
                    currentUrl={form.image_url}
                    onUploaded={url => upd('image_url', url)}
                    onRemoved={() => upd('image_url', null)}
                  />
                  <ImageUpload
                    label="Photo 2"
                    currentUrl={form.image_url_2}
                    onUploaded={url => upd('image_url_2', url)}
                    onRemoved={() => upd('image_url_2', null)}
                  />
                  <ImageUpload
                    label="Photo 3"
                    currentUrl={form.image_url_3}
                    onUploaded={url => upd('image_url_3', url)}
                    onRemoved={() => upd('image_url_3', null)}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
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
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Reject bike</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="input-field w-full h-24 resize-none"
              placeholder="Reason for rejection (optional)"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectModal(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button
                onClick={() => review(rejectModal.id, 'reject', rejectReason)}
                className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freeze modal */}
      {freezeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Freeze — {freezeModal.name}</h3>
            <p className="text-sm text-muted">Block bookings for this bike during the specified period (maintenance, repair, etc.).</p>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">From *</label>
              <input type="datetime-local" value={freezeForm.frozen_from} onChange={e => setFreezeForm(f => ({ ...f, frozen_from: e.target.value }))} className="input-field w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Until *</label>
              <input type="datetime-local" value={freezeForm.frozen_until} onChange={e => setFreezeForm(f => ({ ...f, frozen_until: e.target.value }))} className="input-field w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Reason *</label>
              <input value={freezeForm.freeze_reason} onChange={e => setFreezeForm(f => ({ ...f, freeze_reason: e.target.value }))} className="input-field w-full" placeholder="e.g. Tyre replacement" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setFreezeModal(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button
                onClick={() => toggleFreeze(freezeModal.id, false)}
                disabled={!freezeForm.frozen_until || !freezeForm.freeze_reason}
                className="px-4 py-2 text-sm bg-info text-white rounded-lg hover:bg-info/90 disabled:opacity-50"
              >
                Freeze Bike
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Delete bike?</h3>
            <p className="text-sm text-muted">This will permanently delete the bike and all its data. This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button
                onClick={() => deleteBike(deleteConfirm)}
                className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
