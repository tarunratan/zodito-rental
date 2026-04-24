'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/utils';

export function KycTab({ users }: { users: any[] }) {
  if (users.length === 0) {
    return (
      <div className="card p-10 text-center text-muted">
        <div className="text-4xl mb-2">✨</div>
        <p className="text-sm">No KYC submissions pending review</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {users.map(u => <KycRow key={u.id} user={u} />)}
    </div>
  );
}

function KycRow({ user }: { user: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function action(kind: 'approve' | 'reject') {
    let reason: string | null = null;
    if (kind === 'reject') {
      reason = window.prompt('Reason for rejection (shown to user, e.g. "DL photo blurred"):');
      if (reason === null) return;
    }
    setLoading(kind);
    try {
      const res = await fetch('/api/admin/kyc/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, action: kind, reason }),
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
    <>
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-lg">
              {user.first_name} {user.last_name}
            </h3>
            <div className="text-sm text-muted mt-0.5">
              {user.email} · {user.phone ?? '—'}
            </div>
            <div className="text-sm mt-1">
              DL #: <span className="font-mono">{user.dl_number}</span>
            </div>
            <div className="text-[11px] text-muted mt-1">
              Submitted {formatDateTime(user.kyc_submitted_at)}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => action('approve')}
              disabled={loading !== null}
              className="btn-accent text-sm disabled:opacity-50"
            >
              {loading === 'approve' ? '…' : '✓ Approve'}
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

        {/* Docs grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <DocPanel label="Driving License" url={user.dl_photo_url} onClick={setPreviewUrl} />
          <DocPanel label="Aadhaar Card" url={user.aadhaar_photo_url} onClick={setPreviewUrl} />
          <DocPanel label="Selfie with DL" url={user.selfie_with_dl_photo_url} onClick={setPreviewUrl} />
        </div>

        <div className="mt-4 p-3 bg-bg rounded-md text-[11px] text-muted leading-relaxed">
          <strong className="text-primary">Verification checklist:</strong> DL photo clear, name matches, DL number matches form · Aadhaar readable · Selfie shows same face holding DL · No photoshop signs
        </div>
      </div>

      {/* Full-screen preview */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="document" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

function DocPanel({
  label, url, onClick,
}: { label: string; url: string | null; onClick: (u: string) => void }) {
  // If url is a Supabase Storage path, it needs a signed URL — but for simplicity
  // in this iteration, we assume the URL is already a full public/signed URL.
  // For real prod KYC, use signed URLs generated in the admin API route.
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">{label}</div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          className="w-full h-40 object-cover rounded-lg border border-border cursor-zoom-in"
          onClick={() => onClick(url)}
        />
      ) : (
        <div className="w-full h-40 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted">
          Not uploaded
        </div>
      )}
    </div>
  );
}
