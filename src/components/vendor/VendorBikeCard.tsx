'use client';

import { useState } from 'react';

export function VendorBikeCard({ bike }: { bike: any }) {
  const [isActive, setIsActive] = useState<boolean>(bike.is_active);
  const [toggling, setToggling] = useState(false);

  const status = bike.listing_status;
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    draft:            { bg: 'bg-border',       text: 'text-muted',    label: 'Draft' },
    pending_approval: { bg: 'bg-warning/15',   text: 'text-warning',  label: 'Pending Review' },
    approved:         { bg: 'bg-success/15',   text: 'text-success',  label: 'Live' },
    rejected:         { bg: 'bg-danger/15',    text: 'text-danger',   label: 'Rejected' },
    inactive:         { bg: 'bg-muted/15',     text: 'text-muted',    label: 'Inactive' },
  };
  const s = styles[status] ?? styles.draft;

  async function toggle() {
    if (toggling) return;
    const next = !isActive;
    setIsActive(next);   // optimistic
    setToggling(true);
    const res = await fetch(`/api/vendor/bikes/${bike.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) setIsActive(isActive);  // revert on error
    setToggling(false);
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="text-4xl">{bike.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm line-clamp-1">{bike.model.display_name}</div>
          <div className="text-xs text-muted mt-0.5">{bike.color} · {bike.year}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
              {s.label}
            </span>
          </div>
          {bike.registration_number && (
            <div className="text-[10px] text-muted mt-2">{bike.registration_number}</div>
          )}

          {/* Show toggle only for approved bikes — others can't be listed anyway */}
          {status === 'approved' && (
            <button
              onClick={toggle}
              disabled={toggling}
              title={isActive ? 'Listed — click to hide from customers' : 'Hidden — click to list for customers'}
              className={`mt-3 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                isActive ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <span className={`w-7 h-4 rounded-full relative transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${isActive ? 'left-3.5' : 'left-0.5'}`} />
              </span>
              {isActive ? 'Listed' : 'Hidden'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
