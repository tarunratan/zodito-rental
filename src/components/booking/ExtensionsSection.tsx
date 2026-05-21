/**
 * Reusable extensions list for booking detail surfaces.
 *
 * Used by:
 *   - /my-bookings/[id]                                (customer view)
 *   - /admin/bookings → OnlineBookingDetailModal       (admin view)
 *
 * Shows each extension as its own card with: original drop-off → new
 * drop-off, extra hours/km, amount + paid status, matched tier. Critical
 * because booking.end_ts gets MUTATED on a confirmed extension — the
 * customer would otherwise see "21 May → 25 May" with no indication
 * they originally booked through the 22nd. Each extension card here is
 * the audit record that explains why the dates moved.
 */

import { formatINR, formatDateTime } from '@/lib/utils';

export type ExtensionRow = {
  id: string;
  status: 'pending_payment' | 'confirmed' | 'failed' | 'expired';
  original_end_ts: string;
  new_end_ts: string;
  extra_hours?: number;
  extra_km?: number;
  original_km_limit?: number;
  new_km_limit?: number;
  total_delta: number;
  base_delta?: number;
  gst_delta?: number;
  matched_tier?: string | null;
  paid_at?: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<ExtensionRow['status'], { ring: string; label: string }> = {
  pending_payment: { ring: 'bg-yellow-100 text-yellow-700 border-yellow-200',  label: 'Pending payment' },
  confirmed:       { ring: 'bg-green-100 text-green-700 border-green-200',    label: 'Paid · confirmed' },
  failed:          { ring: 'bg-red-100 text-red-700 border-red-200',          label: 'Payment failed' },
  expired:         { ring: 'bg-gray-100 text-gray-500 border-gray-200',       label: 'Link expired' },
};

export function ExtensionsSection({
  extensions,
  variant = 'card',
  audience = 'customer',
}: {
  extensions: ExtensionRow[];
  variant?: 'card' | 'inline';   // 'card' wraps in its own card; 'inline' assumes parent provides chrome
  audience?: 'customer' | 'admin';
}) {
  if (!extensions || extensions.length === 0) return null;

  // Show paid/confirmed extensions first, then pending, then failed/expired —
  // matches what the operator/customer wants at the top.
  const sorted = [...extensions].sort((a, b) => {
    const rank: Record<ExtensionRow['status'], number> = {
      confirmed: 0, pending_payment: 1, failed: 2, expired: 3,
    };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const paidCount = sorted.filter(e => e.status === 'confirmed').length;
  const pendingCount = sorted.filter(e => e.status === 'pending_payment').length;

  const body = (
    <>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-display font-semibold text-base">
          Booking extensions
          <span className="text-xs text-muted font-normal ml-2">
            {paidCount} paid{pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
          </span>
        </h3>
      </div>

      <ul className="space-y-2.5">
        {sorted.map(e => <ExtensionCard key={e.id} ext={e} audience={audience} />)}
      </ul>
    </>
  );

  if (variant === 'inline') return <div className="space-y-2">{body}</div>;
  return <div className="card p-4 sm:p-5">{body}</div>;
}

function ExtensionCard({ ext, audience }: { ext: ExtensionRow; audience: 'customer' | 'admin' }) {
  const style = STATUS_STYLES[ext.status];
  const extraHours = ext.extra_hours ?? 0;
  const extraDays  = extraHours >= 24 ? Math.round((extraHours / 24) * 10) / 10 : 0;
  const durationLabel = extraDays >= 1
    ? `+${extraDays} day${extraDays === 1 ? '' : 's'}`
    : `+${Math.round(extraHours)} hr`;

  return (
    <li className={`rounded-lg border-2 ${style.ring.replace(/bg-\w+-100|text-\w+-\d+/g, '').trim()} bg-white overflow-hidden`}>
      <div className={`px-3 py-2 flex items-center justify-between gap-2 ${style.ring} border-b`}>
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {style.label}
        </span>
        <span className="text-[10px] text-muted">
          {ext.paid_at ? `Paid ${formatDateTime(ext.paid_at)}` : `Requested ${formatDateTime(ext.created_at)}`}
        </span>
      </div>

      <div className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        {/* Period change — the main "story" of this extension */}
        <div className="sm:col-span-2 flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted">Drop-off</span>
          <span className="font-semibold">{formatDateTime(ext.original_end_ts)}</span>
          <span className="text-muted">→</span>
          <span className="font-semibold text-accent">{formatDateTime(ext.new_end_ts)}</span>
          <span className="text-[10px] text-muted bg-bg/60 border border-border rounded px-1.5 py-0.5">
            {durationLabel}
          </span>
        </div>

        {/* Extra KM */}
        {(ext.extra_km ?? 0) > 0 ? (
          <Row label="Extra KM" value={`+${ext.extra_km} km${ext.new_km_limit ? ` · total ${ext.new_km_limit} km` : ''}`} />
        ) : (
          ext.new_km_limit != null && (
            <Row label="KM limit" value={`${ext.new_km_limit} km (no change)`} muted />
          )
        )}

        {/* Amount + paid status */}
        <Row
          label="Amount"
          value={
            <span className={ext.status === 'confirmed' ? 'text-success font-semibold' : ''}>
              {formatINR(Number(ext.total_delta))}
              {ext.status === 'confirmed' && <span className="text-[10px] text-muted ml-1">· paid</span>}
              {ext.status === 'pending_payment' && <span className="text-[10px] text-yellow-700 ml-1">· awaiting payment</span>}
            </span>
          }
        />

        {/* Tier (admin only — customers don't care about internal tier names) */}
        {audience === 'admin' && ext.matched_tier && (
          <Row label="Tier matched" value={ext.matched_tier} muted />
        )}
      </div>
    </li>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`text-right ${muted ? 'text-muted' : ''}`}>{value}</span>
    </div>
  );
}
