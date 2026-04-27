'use client';

import { useState } from 'react';

type KycUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  kyc_status: string;
  dl_number: string | null;
  dl_photo_url: string | null;
  aadhaar_photo_url: string | null;
  selfie_with_dl_photo_url: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function KycReviewManager({ initialUsers }: { initialUsers: KycUser[] }) {
  const [users, setUsers] = useState<KycUser[]>(initialUsers);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const filtered = users.filter(u => filter === 'all' || u.kyc_status === filter);

  async function review(user_id: string, action: 'approve' | 'reject', reason?: string) {
    setLoading(user_id);
    const res = await fetch('/api/admin/kyc/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, action, reason: reason || null }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u =>
        u.id === user_id
          ? { ...u, kyc_status: action === 'approve' ? 'approved' : 'rejected', kyc_rejection_reason: reason || null }
          : u
      ));
      setExpanded(null);
    }
    setLoading(null);
    setRejectModal(null);
    setRejectReason('');
  }

  const counts = {
    all: users.length,
    pending: users.filter(u => u.kyc_status === 'pending').length,
    approved: users.filter(u => u.kyc_status === 'approved').length,
    rejected: users.filter(u => u.kyc_status === 'rejected').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">KYC Verification Queue</h2>
        <span className="text-sm text-muted">{filtered.length} records</span>
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'all', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${filter === s ? 'bg-accent text-white' : 'bg-border/60 text-muted hover:bg-border'}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${filter === s ? 'bg-white/20 text-white' : 'bg-muted/20 text-muted'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            {filter === 'pending' ? "No pending KYC submissions — you're all caught up!" : 'No records found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">DL Number</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <>
                    <tr key={user.id}
                      className={`border-b border-border hover:bg-bg/40 cursor-pointer transition-colors ${expanded === user.id ? 'bg-bg/60' : ''}`}
                      onClick={() => setExpanded(e => e === user.id ? null : user.id)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}</div>
                        <div className="text-xs text-muted">{user.email}</div>
                        {user.phone && <div className="text-xs text-muted">{user.phone}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{user.dl_number ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted">{fmt(user.kyc_submitted_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[user.kyc_status] ?? ''}`}>
                          {user.kyc_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          {user.kyc_status === 'pending' && (
                            <>
                              <button onClick={() => review(user.id, 'approve')} disabled={loading === user.id}
                                className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors disabled:opacity-50">
                                Approve
                              </button>
                              <button onClick={() => { setRejectModal({ id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'User' }); setRejectReason(''); }}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                                Reject
                              </button>
                            </>
                          )}
                          <button onClick={() => setExpanded(e => e === user.id ? null : user.id)}
                            className="text-xs px-2 py-1 bg-border text-primary rounded hover:bg-border/70 transition-colors">
                            {expanded === user.id ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === user.id && (
                      <tr key={`${user.id}-expanded`} className="border-b border-border bg-bg/30">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-4">
                              {[
                                { label: 'Driving Licence', url: user.dl_photo_url },
                                { label: 'Aadhaar', url: user.aadhaar_photo_url },
                                { label: 'Selfie with DL', url: user.selfie_with_dl_photo_url },
                              ].map(doc => (
                                <div key={doc.label} className="flex flex-col items-center gap-2">
                                  <span className="text-xs font-semibold text-muted uppercase tracking-wide">{doc.label}</span>
                                  {doc.url ? (
                                    <div className="w-40 h-28 rounded-lg overflow-hidden border border-border cursor-pointer hover:border-accent transition-colors bg-bg"
                                      onClick={() => setLightbox(doc.url!)}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="w-40 h-28 rounded-lg border border-dashed border-border flex items-center justify-center bg-bg">
                                      <span className="text-xs text-muted">Not uploaded</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {user.kyc_status === 'rejected' && user.kyc_rejection_reason && (
                              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-xs font-semibold text-red-600 mb-1">Rejection reason</p>
                                <p className="text-sm text-red-500">{user.kyc_rejection_reason}</p>
                              </div>
                            )}
                            {user.kyc_reviewed_at && (
                              <p className="text-xs text-muted">Reviewed: {fmt(user.kyc_reviewed_at)}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Reject KYC — {rejectModal.name}</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="input-field w-full h-24 resize-none" placeholder="Reason for rejection (will be sent to user)" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectModal(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button onClick={() => review(rejectModal.id, 'reject', rejectReason)}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
                Reject & Notify
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Document" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
