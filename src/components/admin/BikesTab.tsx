'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateShort } from '@/lib/utils';

export function BikesTab({ bikes }: { bikes: any[] }) {
  if (bikes.length === 0) {
    return (
      <div className="card p-10 text-center text-muted">
        <div className="text-4xl mb-2">✨</div>
        <p className="text-sm">All bike listings reviewed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bikes.map(b => <BikeRow key={b.id} bike={b} />)}
    </div>
  );
}

function BikeRow({ bike }: { bike: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  async function action(kind: 'approve' | 'reject') {
    let reason: string | null = null;
    if (kind === 'reject') {
      reason = window.prompt('Reason for rejection (shown to vendor):');
      if (reason === null) return;
    }
    setLoading(kind);
    try {
      const res = await fetch('/api/admin/bikes/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bike_id: bike.id, action: kind, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed');
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-4 flex-1 min-w-0">
          <div className="text-5xl shrink-0">{bike.emoji}</div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-lg">
              {bike.model.display_name}
            </h3>
            <div className="text-sm text-muted mt-0.5">
              {bike.color} · {bike.year} · {bike.model.cc}cc
            </div>
            <div className="text-xs text-muted mt-1">
              Reg: <span className="font-mono">{bike.registration_number || '—'}</span>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted">Listed by:</span>{' '}
              <span className="font-semibold">{bike.vendor?.business_name ?? 'Unknown'}</span>
            </div>
            <div className="text-[11px] text-muted">Submitted {formatDateShort(bike.created_at)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => action('approve')}
            disabled={loading !== null}
            className="btn-accent text-sm disabled:opacity-50"
          >
            {loading === 'approve' ? '…' : '✓ Approve & list'}
          </button>
          <button
            onClick={() => action('reject')}
            disabled={loading !== null}
            className="text-sm font-medium px-4 py-2 border border-danger/30 text-danger rounded-lg hover:bg-danger/5 transition-colors disabled:opacity-50"
          >
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}
