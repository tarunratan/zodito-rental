'use client';

import { useState } from 'react';
import Link from 'next/link';

type Bike = {
  id: string;
  listing_status: string;
  is_active: boolean;
  registration_number: string | null;
  color: string | null;
  color_hex: string | null;
  year: number | null;
  emoji: string;
  image_url: string | null;
  rejection_reason: string | null;
  model: { id: string; display_name: string; category: string; cc: number } | null;
};

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-success/10 text-success',
  pending_approval: 'bg-warning/10 text-warning',
  rejected: 'bg-danger/10 text-danger',
  draft: 'bg-muted/10 text-muted',
  inactive: 'bg-border text-muted',
};

export function VendorBikeList({ bikes, vendorId }: { bikes: Bike[]; vendorId: string }) {
  const [list, setList] = useState(bikes);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function deleteBike(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/vendor/bikes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setList(l => l.filter(b => b.id !== id));
    }
    setDeleting(null);
    setConfirmDelete(null);
  }

  if (list.length === 0) {
    return (
      <div className="card p-12 text-center text-muted text-sm">
        <div className="text-4xl mb-3">🏍️</div>
        <p>You haven't listed any bikes yet.</p>
        <Link href="/vendor/bikes/new" className="btn-accent inline-block mt-4 px-4 py-2 text-sm">
          List your first bike
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {list.map(bike => (
          <div key={bike.id} className="card p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center shrink-0">
              {bike.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bike.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">{bike.emoji}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{bike.model?.display_name ?? '—'}</div>
              <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                {bike.color_hex && (
                  <span className="w-2.5 h-2.5 rounded-full border border-border inline-block" style={{ backgroundColor: bike.color_hex }} />
                )}
                <span>{bike.color ?? '—'}</span>
                {bike.year && <span>• {bike.year}</span>}
                {bike.registration_number && <span>• {bike.registration_number}</span>}
              </div>
              {bike.listing_status === 'rejected' && bike.rejection_reason && (
                <p className="text-xs text-danger mt-1">Rejected: {bike.rejection_reason}</p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[bike.listing_status] ?? ''}`}>
                {bike.listing_status.replace('_', ' ')}
              </span>
              {(bike.listing_status === 'draft' || bike.listing_status === 'rejected') && (
                <button
                  onClick={() => setConfirmDelete(bike.id)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Remove bike?</h3>
            <p className="text-sm text-muted">This will permanently remove this listing.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button
                onClick={() => deleteBike(confirmDelete)}
                disabled={deleting === confirmDelete}
                className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90 disabled:opacity-60"
              >
                {deleting === confirmDelete ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
