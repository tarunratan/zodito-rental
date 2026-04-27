'use client';

import { useState } from 'react';

type VendorRow = {
  id: string;
  business_name: string;
  contact_phone: string;
  contact_email: string | null;
  pickup_address: string;
  pickup_area: string;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  commission_pct: number;
  status: string;
  approval_notes: string | null;
  approved_at: string | null;
  created_at: string;
  user: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-100 text-gray-500',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function VendorReviewManager({ initialVendors }: { initialVendors: VendorRow[] }) {
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = vendors.filter(v => filter === 'all' || v.status === filter);

  async function review(vendor_id: string, action: 'approve' | 'reject', notesText?: string) {
    setLoading(vendor_id);
    const res = await fetch('/api/admin/vendors/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_id, action, notes: notesText || null }),
    });
    if (res.ok) {
      setVendors(prev => prev.map(v =>
        v.id === vendor_id ? { ...v, status: action === 'approve' ? 'approved' : 'rejected', approval_notes: notesText || null } : v
      ));
      setExpanded(null);
    }
    setLoading(null);
    setRejectModal(null);
    setNotes('');
  }

  const counts = {
    all: vendors.length,
    pending: vendors.filter(v => v.status === 'pending').length,
    approved: vendors.filter(v => v.status === 'approved').length,
    rejected: vendors.filter(v => v.status === 'rejected').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Vendor Applications</h2>
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
            {filter === 'pending' ? 'No pending vendor applications.' : 'No records found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Business</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Area</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Applied</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(vendor => (
                  <>
                    <tr key={vendor.id}
                      className={`border-b border-border hover:bg-bg/40 cursor-pointer transition-colors ${expanded === vendor.id ? 'bg-bg/60' : ''}`}
                      onClick={() => setExpanded(e => e === vendor.id ? null : vendor.id)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{vendor.business_name}</div>
                        <div className="text-xs text-muted">{vendor.contact_phone}</div>
                        {vendor.contact_email && <div className="text-xs text-muted">{vendor.contact_email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{[vendor.user?.first_name, vendor.user?.last_name].filter(Boolean).join(' ') || '—'}</div>
                        <div className="text-xs text-muted">{vendor.user?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{vendor.pickup_area}</td>
                      <td className="px-4 py-3 text-xs text-muted">{fmt(vendor.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[vendor.status] ?? ''}`}>
                          {vendor.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          {vendor.status === 'pending' && (
                            <>
                              <button onClick={() => review(vendor.id, 'approve')} disabled={loading === vendor.id}
                                className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors disabled:opacity-50">
                                Approve
                              </button>
                              <button onClick={() => { setRejectModal({ id: vendor.id, name: vendor.business_name }); setNotes(''); }}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                                Reject
                              </button>
                            </>
                          )}
                          <button onClick={() => setExpanded(e => e === vendor.id ? null : vendor.id)}
                            className="text-xs px-2 py-1 bg-border text-primary rounded hover:bg-border/70 transition-colors">
                            {expanded === vendor.id ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === vendor.id && (
                      <tr key={`${vendor.id}-expanded`} className="border-b border-border bg-bg/30">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Pickup Address</p>
                              <p>{vendor.pickup_address}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase mb-1">Commission</p>
                              <p>{vendor.commission_pct}%</p>
                            </div>
                            {vendor.bank_account_name && (
                              <div>
                                <p className="text-xs font-semibold text-muted uppercase mb-1">Bank</p>
                                <p>{vendor.bank_account_name}</p>
                                <p className="text-xs text-muted font-mono">{vendor.bank_account_number}</p>
                                <p className="text-xs text-muted">{vendor.bank_ifsc}</p>
                              </div>
                            )}
                            {vendor.upi_id && (
                              <div>
                                <p className="text-xs font-semibold text-muted uppercase mb-1">UPI</p>
                                <p className="font-mono text-xs">{vendor.upi_id}</p>
                              </div>
                            )}
                            {vendor.approval_notes && (
                              <div className="col-span-2">
                                <p className="text-xs font-semibold text-muted uppercase mb-1">Notes</p>
                                <p className="text-sm text-muted">{vendor.approval_notes}</p>
                              </div>
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
            <h3 className="font-semibold">Reject — {rejectModal.name}</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="input-field w-full h-24 resize-none" placeholder="Feedback for the vendor (optional)" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectModal(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button onClick={() => review(rejectModal.id, 'reject', notes)}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
                Reject & Notify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
