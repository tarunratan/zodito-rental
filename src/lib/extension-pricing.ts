/**
 * Pricing helper for booking extensions.
 *
 * Two strategies, picked depending on what the data looks like:
 *
 *   1. PRIMARY — "full-trip minus original": price the FULL extended trip
 *      against the current admin-configured tiers, then subtract whatever
 *      the customer already paid. Works correctly when extending into a
 *      MORE expensive bracket (e.g. 24h → 36h → 2day, each tier costlier).
 *
 *   2. FALLBACK — "extra-time as fresh booking": used when the full-trip
 *      recomputation would charge LESS than the customer already paid
 *      (admin's longer package is, for whatever reason, cheaper than the
 *      tier the original booking used — e.g. a discounted 7-day custom
 *      package priced lower than a single 24hr rental). In that case the
 *      "full minus original" path clamps to zero and lets the customer
 *      extend by days for free, which is wrong. We instead price the
 *      EXTRA time alone as if it were a brand-new rental starting at
 *      the original drop-off, and add its KM allowance to the original.
 *
 * Both strategies produce non-negative deltas. The fallback also fires if
 * the full-trip path produces zero KM allowance increase despite a
 * positive duration extension — same symptom, same fix.
 */

import {
  calculatePrice,
  coveringTier,
  type CustomPackage,
  type PackageTier,
} from './pricing';

export interface ExtensionQuote {
  extraHours: number;
  extraKm: number;
  originalKmLimit: number;
  newKmLimit: number;
  baseDelta: number;
  gstDelta: number;
  totalDelta: number;
  matchedTier: PackageTier | null;
  matchedCustomPackageId: string | null;
  matchedLabel: string;
}

export interface ExtensionInputs {
  startTs: Date;
  originalEndTs: Date;
  newEndTs: Date;
  originalBasePrice: number;
  originalGstAmount: number;
  originalKmLimit: number;
  availableTiers: PackageTier[];
  /** All model-level packages on this bike (for `calculatePrice` lookups). */
  packages: { tier: PackageTier; price: number; km_limit: number }[];
  customPackages: CustomPackage[];
}

export function quoteExtension(input: ExtensionInputs): ExtensionQuote | { error: string } {
  const { startTs, originalEndTs, newEndTs, originalBasePrice, originalGstAmount, originalKmLimit,
    availableTiers, packages, customPackages } = input;

  if (newEndTs.getTime() <= originalEndTs.getTime()) {
    return { error: 'New drop-off must be after the current drop-off.' };
  }

  const totalNewHours = (newEndTs.getTime() - startTs.getTime()) / 3_600_000;
  const extraHours    = (newEndTs.getTime() - originalEndTs.getTime()) / 3_600_000;

  const fullMatch = coveringTier(totalNewHours, availableTiers, customPackages);
  if (!fullMatch) {
    return { error: 'No package covers the requested extension duration.' };
  }

  const fullBreakdown = fullMatch.type === 'custom'
    ? calculatePrice({ customPackage: fullMatch.pkg, customActualHours: totalNewHours, extraHelmetCount: 0, hasOriginalDL: true })
    : calculatePrice({
        packages: packages as any,
        tier: fullMatch.tier,
        actualDays: fullMatch.actualDays,
        extraHelmetCount: 0,
        hasOriginalDL: true,
      });

  const rawBaseDelta = fullBreakdown.basePrice - originalBasePrice;
  const rawKmDelta   = fullBreakdown.kmLimit   - originalKmLimit;

  // Primary path holds when extending genuinely pushes the booking into a
  // costlier bracket. If the full-trip recomputation comes out CHEAPER than
  // what the customer already paid (or the new bracket has FEWER km), the
  // customer would extend for free — instead, re-price the extra hours as
  // a fresh standalone rental and use that as the delta.
  if (rawBaseDelta <= 0 || rawKmDelta < 0) {
    const extraMatch = coveringTier(extraHours, availableTiers, customPackages);
    if (!extraMatch) {
      return { error: 'No package available for this extension duration. Pick a different drop-off time.' };
    }
    const extraBreakdown = extraMatch.type === 'custom'
      ? calculatePrice({ customPackage: extraMatch.pkg, customActualHours: extraHours, extraHelmetCount: 0, hasOriginalDL: true })
      : calculatePrice({
          packages: packages as any,
          tier: extraMatch.tier,
          actualDays: extraMatch.actualDays,
          extraHelmetCount: 0,
          hasOriginalDL: true,
        });

    return {
      extraHours: Number(extraHours.toFixed(2)),
      extraKm:    extraBreakdown.kmLimit,
      originalKmLimit,
      newKmLimit: originalKmLimit + extraBreakdown.kmLimit,
      baseDelta:  extraBreakdown.basePrice,
      gstDelta:   extraBreakdown.gstAmount,
      totalDelta: extraBreakdown.basePrice + extraBreakdown.gstAmount,
      matchedTier:            extraMatch.type === 'standard' ? extraMatch.tier : null,
      matchedCustomPackageId: extraMatch.type === 'custom'   ? extraMatch.pkg.id : null,
      matchedLabel:           extraMatch.type === 'custom'   ? extraMatch.pkg.label : extraMatch.tier,
    };
  }

  // Primary path — full-trip minus original.
  const baseDelta  = Math.max(0, rawBaseDelta);
  const gstDelta   = Math.max(0, fullBreakdown.gstAmount - originalGstAmount);
  const totalDelta = baseDelta + gstDelta;
  const extraKm    = Math.max(0, rawKmDelta);

  return {
    extraHours: Number(extraHours.toFixed(2)),
    extraKm,
    originalKmLimit,
    newKmLimit: fullBreakdown.kmLimit,
    baseDelta,
    gstDelta,
    totalDelta,
    matchedTier:            fullMatch.type === 'standard' ? fullMatch.tier : null,
    matchedCustomPackageId: fullMatch.type === 'custom'   ? fullMatch.pkg.id : null,
    matchedLabel:           fullMatch.type === 'custom'   ? fullMatch.pkg.label : fullMatch.tier,
  };
}
