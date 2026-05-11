/**
 * Pricing helper for booking extensions.
 *
 * Strategy: price the FULL extended trip (start_ts → new_end_ts) against the
 * current admin-configured tiers / custom packages, then subtract whatever
 * the customer already paid for the original trip. This works correctly when
 * an extension pushes the booking into a different tier bucket (e.g. 36hr
 * tier upgrading to a 48hr / 2-day bracket).
 *
 * The customer is never charged a negative amount — if for some reason the
 * recomputed price is lower than the original (admin lowered prices, etc.),
 * the delta clamps to zero.
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

  const match = coveringTier(totalNewHours, availableTiers, customPackages);
  if (!match) {
    return { error: 'No package covers the requested extension duration.' };
  }

  const breakdown = match.type === 'custom'
    ? calculatePrice({ customPackage: match.pkg, extraHelmetCount: 0, hasOriginalDL: true })
    : calculatePrice({
        packages: packages as any,
        tier: match.tier,
        actualDays: match.actualDays,
        extraHelmetCount: 0,
        hasOriginalDL: true,
      });

  const baseDelta  = Math.max(0, breakdown.basePrice - originalBasePrice);
  const gstDelta   = Math.max(0, breakdown.gstAmount - originalGstAmount);
  const totalDelta = baseDelta + gstDelta;

  const extraKm    = Math.max(0, breakdown.kmLimit - originalKmLimit);

  return {
    extraHours: Number(extraHours.toFixed(2)),
    extraKm,
    originalKmLimit,
    newKmLimit: breakdown.kmLimit,
    baseDelta,
    gstDelta,
    totalDelta,
    matchedTier:            match.type === 'standard' ? match.tier : null,
    matchedCustomPackageId: match.type === 'custom'   ? match.pkg.id : null,
    matchedLabel:           match.type === 'custom'   ? match.pkg.label
                          : match.tier,
  };
}
