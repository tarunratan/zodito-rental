'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateShort } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function VendorsTab({ vendors }: { vendors: any[] }) {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'suspended' | 'rejected' | 'all'>('pending');
  const filtered = filter === 'all' ? vendors : vendors.filter(v => v.status === filter);

  return (
    <>
      <div className="flex gap-2 mb-4 text-xs flex-wrap">
        <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>
          Pending ({vendors.filter(v => v.status === 'pending').length})
        </FilterChip>
        <FilterChip active={filter === 'approved'} onClick={() => setFilter('approved')}>
          Approved ({vendors.filter(v => v.status === 'approved').length})
        </FilterChip>
        <FilterChip active={filter === 'suspended'} onClick={() => setFilter('suspended')}>
          Suspended ({vendors.filter(v => v.status === 'suspended').length})
        </FilterChip>
        <FilterChip active={filter === 'rejected'} onClick={() => setFilter('rejected')}>
          Rejected ({vendors.filter(v => v.status === 'rejected').length})
        </FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({vendors.length})
        </FilterChip>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <div className="text-4xl mb-2">✨</div>
          <p className="text-sm">No {filter} vendors</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => <VendorRow key={v.id} vendor={v} />)}
        </div>
      )}
    </>
  );
}

function VendorRow({ vendor }: { vendor: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | 'suspend' | 'unsuspend' | 'save' | null>(null);
  // Inline-edit state — admin clicks Edit to expose business name, area,
  // address, phone, commission fields.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    business_name:  vendor.business_name  ?? '',
    contact_phone:  vendor.contact_phone  ?? '',
    pickup_area:    vendor.pickup_area    ?? '',
    pickup_address: vendor.pickup_address ?? '',
    commission_pct: String(vendor.commission_pct ?? 20),
  });

  async function action(kind: 'approve' | 'reject') {
    let notes: string | null = null;
    if (kind === 'reject') {
      notes = window.prompt('Reason for rejection (shown to vendor):');
      if (notes === null) return;
    }
    setLoading(kind);
    try {
      const res = await fetch('/api/admin/vendors/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendor.id, action: kind, notes }),
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

  // Status flip via the PATCH endpoint — suspend an approved vendor (blocks
  // their bikes from appearing publicly via existing is_active filters) or
  // un-suspend back to approved.
  async function flipStatus(target: 'approved' | 'suspended') {
    const ok = window.confirm(
      target === 'suspended'
        ? `Suspend ${vendor.business_name}? Their bikes will be hidden from customers until re-activated.`
        : `Reactivate ${vendor.business_name}? Bikes will appear publicly again.`,
    );
    if (!ok) return;
    setLoading(target === 'suspended' ? 'suspend' : 'unsuspend');
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
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

  async function saveEdits() {
    const payload: any = {};
    if (draft.business_name  !== vendor.business_name)   payload.business_name  = draft.business_name.trim();
    if (draft.contact_phone  !== vendor.contact_phone)   payload.contact_phone  = draft.contact_phone.trim();
    if (draft.pickup_area    !== vendor.pickup_area)     payload.pickup_area    = draft.pickup_area.trim();
    if (draft.pickup_address !== vendor.pickup_address)  payload.pickup_address = draft.pickup_address.trim();
    const cmsNum = parseFloat(draft.commission_pct);
    if (Number.isFinite(cmsNum) && cmsNum !== Number(vendor.commission_pct)) payload.commission_pct = cmsNum;
    if (Object.keys(payload).length === 0) { setEditing(false); return; }

    setLoading('save');
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed'); return; }
      setEditing(false);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  const statusStyles: Record<string, string> = {
    pending: 'bg-warning/15 text-warning',
    approved: 'bg-success/15 text-success',
    rejected: 'bg-danger/15 text-danger',
    suspended: 'bg-danger/15 text-danger',
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-lg">{vendor.business_name}</h3>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${statusStyles[vendor.status]}`}>
              {vendor.status}
            </span>
          </div>
          <div className="text-sm text-muted mt-1">
            {vendor.user?.first_name} {vendor.user?.last_name} · {vendor.user?.email}
          </div>

          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
              <Info label="Phone" value={
                <a href={`tel:${vendor.contact_phone}`} className="text-accent">
                  {vendor.contact_phone}
                </a>
              } />
              <Info label="Area" value={vendor.pickup_area} />
              <Info label="Address" value={vendor.pickup_address} />
              <Info label="UPI / Bank" value={
                vendor.upi_id
                  ? <span className="text-sm">{vendor.upi_id} (UPI)</span>
                  : vendor.bank_account_number
                    ? <span className="text-sm">A/c ending {vendor.bank_account_number.slice(-4)} · {vendor.bank_ifsc}</span>
                    : <span className="text-danger text-xs">Missing</span>
              } />
              <Info label="Applied" value={formatDateShort(vendor.created_at)} />
              <Info label="Commission" value={`${vendor.commission_pct ?? 20}%`} />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <EditField label="Business name"  value={draft.business_name}  onChange={v => setDraft(d => ({ ...d, business_name: v }))} />
              <EditField label="Phone"          value={draft.contact_phone}  onChange={v => setDraft(d => ({ ...d, contact_phone: v }))} />
              <EditField label="Pickup area"    value={draft.pickup_area}    onChange={v => setDraft(d => ({ ...d, pickup_area: v }))} />
              <EditField label="Pickup address" value={draft.pickup_address} onChange={v => setDraft(d => ({ ...d, pickup_address: v }))} />
              <EditField label="Commission %"   value={draft.commission_pct} onChange={v => setDraft(d => ({ ...d, commission_pct: v }))} type="number" />
            </div>
          )}

          {vendor.approval_notes && (
            <div className="mt-3 p-2.5 bg-bg rounded-md text-xs text-muted">
              <span className="font-semibold">Notes:</span> {vendor.approval_notes}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0 min-w-[140px]">
          {/* Edit mode actions */}
          {editing && (
            <>
              <button
                onClick={saveEdits}
                disabled={loading !== null}
                className="btn-accent text-sm disabled:opacity-50"
              >
                {loading === 'save' ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={loading !== null}
                className="text-sm font-medium px-4 py-2 border border-border text-muted rounded-lg hover:bg-border/40"
              >
                Cancel
              </button>
            </>
          )}

          {/* First-time approval path — only for pending. */}
          {!editing && vendor.status === 'pending' && (
            <>
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
            </>
          )}

          {/* Post-approval lifecycle — edit, suspend, unsuspend. */}
          {!editing && vendor.status === 'approved' && (
            <>
              <button onClick={() => setEditing(true)} className="text-sm font-medium px-4 py-2 border border-accent/30 text-accent rounded-lg hover:bg-accent/5">
                ✎ Edit details
              </button>
              <button
                onClick={() => flipStatus('suspended')}
                disabled={loading !== null}
                className="text-sm font-medium px-4 py-2 border border-danger/30 text-danger rounded-lg hover:bg-danger/5 disabled:opacity-50"
              >
                {loading === 'suspend' ? '…' : '⏸ Suspend'}
              </button>
            </>
          )}

          {!editing && vendor.status === 'suspended' && (
            <>
              <button onClick={() => setEditing(true)} className="text-sm font-medium px-4 py-2 border border-accent/30 text-accent rounded-lg hover:bg-accent/5">
                ✎ Edit details
              </button>
              <button
                onClick={() => flipStatus('approved')}
                disabled={loading !== null}
                className="btn-accent text-sm disabled:opacity-50"
              >
                {loading === 'unsuspend' ? '…' : '▶ Reactivate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input w-full text-sm"
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md font-semibold uppercase tracking-wide transition-colors',
        active
          ? 'bg-primary text-white'
          : 'bg-border/50 text-muted hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}
