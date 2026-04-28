'use client';

import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';
import type { PriceBreakdown } from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';
import { CouponInput, type AppliedCoupon } from './CouponInput';

type Bike = any;

export function OrderSummary({
  bike,
  breakdown,
  pickupTs,
  endTs,
  tier,
  appliedCoupon,
  onCouponApply,
}: {
  bike: Bike;
  breakdown: PriceBreakdown | null;
  pickupTs: Date | null;
  endTs: Date | null;
  tier: PackageTier;
  appliedCoupon: AppliedCoupon | null;
  onCouponApply: (coupon: AppliedCoupon | null) => void;
}) {
  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-lg mb-4">Order summary</h3>

      <div className="flex gap-3 pb-4 border-b border-border">
        <div className="w-14 h-14 rounded-lg bg-primary/5 overflow-hidden flex items-center justify-center shrink-0">
          {bike.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bike.image_url} alt={bike.model.display_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">{bike.emoji}</span>
          )}
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
          {breakdown.mobileHolderCharge > 0 && (
            <Row label="Mobile holder" value={formatINR(breakdown.mobileHolderCharge)} />
          )}
          <Row label="Subtotal" value={formatINR(breakdown.subtotal)} muted />
          <Row label="GST (18%)" value={formatINR(breakdown.gstAmount)} muted />
          {breakdown.couponDiscount > 0 && (
            <Row
              label={appliedCoupon ? `Coupon (${appliedCoupon.code})` : 'Coupon discount'}
              value={`−${formatINR(breakdown.couponDiscount)}`}
              success
            />
          )}
          <Row label="Security deposit" value={formatINR(breakdown.securityDeposit)} muted note="cash/UPI at pickup" />
        </div>
      )}

      {/* Coupon input — shown once breakdown is available */}
      {breakdown && (
        <div className="pb-3 border-b border-border">
          <CouponInput
            subtotal={breakdown.subtotal}
            gstAmount={breakdown.gstAmount}
            applied={appliedCoupon}
            onApply={onCouponApply}
          />
        </div>
      )}

      {breakdown && (
        <div className="pt-3 flex items-baseline justify-between">
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
  label, value, small, muted, success, note,
}: { label: string; value: string; small?: boolean; muted?: boolean; success?: boolean; note?: string }) {
  return (
    <div className={`flex justify-between items-baseline ${small ? 'text-xs' : ''}`}>
      <span className={success ? 'text-success font-medium' : muted ? 'text-muted' : 'text-primary'}>
        {label}
        {note && <span className="text-[10px] text-muted ml-1">({note})</span>}
      </span>
      <span className={success ? 'text-success font-semibold' : muted ? 'text-muted' : 'font-semibold'}>
        {value}
      </span>
    </div>
  );
}
