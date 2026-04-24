'use client';

import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';
import type { PriceBreakdown } from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';

type Bike = any;

export function OrderSummary({
  bike,
  breakdown,
  pickupTs,
  endTs,
  tier,
}: {
  bike: Bike;
  breakdown: PriceBreakdown | null;
  pickupTs: Date | null;
  endTs: Date | null;
  tier: PackageTier;
}) {
  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-lg mb-4">Order summary</h3>

      <div className="flex gap-3 pb-4 border-b border-border">
        <div className="w-14 h-14 rounded-lg bg-primary/5 flex items-center justify-center text-3xl shrink-0">
          {bike.emoji}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm line-clamp-2 leading-snug">{bike.model.display_name}</div>
          <div className="text-xs text-muted mt-0.5">
            {bike.color} · {bike.model.cc}cc
          </div>
        </div>
      </div>

      {pickupTs && endTs && (
        <div className="py-3 border-b border-border space-y-1">
          <Row label="Pickup" value={formatDateTime(pickupTs)} small />
          <Row label="Drop-off" value={formatDateTime(endTs)} small />
        </div>
      )}

      {breakdown && (
        <div className="py-3 space-y-2 text-sm">
          <Row label={`${TIER_LABELS[tier]}`} value={formatINR(breakdown.basePrice)} />
          {breakdown.extraHelmetCount > 0 && (
            <Row
              label={`Extra helmet × ${breakdown.extraHelmetCount}`}
              value={formatINR(breakdown.extraHelmetCharge)}
            />
          )}
          <Row label="Subtotal" value={formatINR(breakdown.subtotal)} muted />
          <Row label="GST (18%)" value={formatINR(breakdown.gstAmount)} muted />
          <Row label="Security deposit" value={formatINR(breakdown.securityDeposit)} muted note="refundable" />
        </div>
      )}

      {breakdown && (
        <div className="pt-3 border-t border-border flex items-baseline justify-between">
          <span className="font-display font-semibold">Total payable</span>
          <span className="font-display font-bold text-xl text-accent">
            {formatINR(breakdown.totalAmount)}
          </span>
        </div>
      )}

      {breakdown && (
        <div className="mt-3 text-[10px] text-muted leading-relaxed">
          Included KM: <span className="font-semibold">{breakdown.kmLimit.toLocaleString('en-IN')}</span>.
          Excess charged at pickup-day rate.
        </div>
      )}

      {!pickupTs && (
        <div className="text-xs text-muted mt-3 text-center italic">
          Pick a date &amp; time to see your total
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, small, muted, note,
}: { label: string; value: string; small?: boolean; muted?: boolean; note?: string }) {
  return (
    <div className={`flex justify-between items-baseline ${small ? 'text-xs' : ''}`}>
      <span className={muted ? 'text-muted' : 'text-primary'}>
        {label}
        {note && <span className="text-[10px] text-muted ml-1">({note})</span>}
      </span>
      <span className={muted ? 'text-muted' : 'font-semibold'}>{value}</span>
    </div>
  );
}
