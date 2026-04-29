// ============================================================================
// PRICING ENGINE
// ============================================================================
// All price math lives here. Import this from both client (for live previews
// in the booking UI) and server (for validated totals before saving a booking).
// ============================================================================

import type {
  BikeModel,
  BikeModelPackage,
  PackageTier,
} from './supabase/types';

export type { PackageTier };

export const GST_RATE = 0.18; // 18%
export const DEFAULT_SECURITY_DEPOSIT = 500;
export const NO_DL_EXTRA_DEPOSIT = 500; // added on top at pickup if no original DL
export const EXTRA_HELMET_PRICE = 50;
export const MOBILE_HOLDER_PRICE = 49;

export const TIER_HOURS: Record<PackageTier, number> = {
  '6hr':  6,
  '12hr': 12,
  '24hr': 24,
  '7day': 24 * 7,
  '15day': 24 * 15,
  '30day': 24 * 30,
};

export const TIER_LABELS: Record<PackageTier, string> = {
  '6hr':  '6 Hours',
  '12hr': '12 Hours',
  '24hr': '24 Hours (1 Day)',
  '7day': '7 Days',
  '15day': '15 Days',
  '30day': '30 Days',
};

/**
 * Is a given date a weekend (Sat or Sun) in IST?
 * We always compute in IST because store and bookings are Hyderabad-local.
 */
export function isWeekendIST(d: Date): boolean {
  // Convert to IST (UTC+5:30)
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000; // fixed UTC→IST offset (+5:30)
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

/**
 * For models with weekend override (Activa 5G/4G → 6G pricing on weekends):
 * returns the effective model_id to use for pricing.
 */
export function effectiveModelIdForDate(
  model: BikeModel,
  startDate: Date
): string {
  if (model.has_weekend_override && model.weekend_override_model_id && isWeekendIST(startDate)) {
    return model.weekend_override_model_id;
  }
  return model.id;
}

export interface PriceBreakdown {
  basePrice: number;
  kmLimit: number;
  extraHelmetCount: number;
  extraHelmetCharge: number;
  mobileHolderCharge: number;
  securityDeposit: number;
  subtotal: number;           // base + helmet + mobile holder (before tax)
  gstAmount: number;
  couponDiscount: number;     // 0 if no coupon applied
  totalAmount: number;        // subtotal + gst - couponDiscount + deposit
  tier: PackageTier;
}

/**
 * Calculate full price breakdown for a booking.
 *
 * `packages` should be all packages for the *effective* model (weekend-adjusted).
 * Use `findPackage()` to pick the right tier from them.
 */
export function calculatePrice(params: {
  packages: BikeModelPackage[];
  tier: PackageTier;
  extraHelmetCount?: number;
  hasOriginalDL?: boolean;
  includeMobileHolder?: boolean;
  couponDiscount?: number;
}): PriceBreakdown {
  const { packages, tier, extraHelmetCount = 0, hasOriginalDL = true, includeMobileHolder = false, couponDiscount: rawDiscount = 0 } = params;

  const pkg = packages.find(p => p.tier === tier);
  if (!pkg) {
    throw new Error(`No package found for tier ${tier}`);
  }

  const basePrice = Number(pkg.price);
  const kmLimit = pkg.km_limit;
  const extraHelmetCharge = extraHelmetCount * EXTRA_HELMET_PRICE;
  const mobileHolderCharge = includeMobileHolder ? MOBILE_HOLDER_PRICE : 0;
  const securityDeposit =
    DEFAULT_SECURITY_DEPOSIT + (hasOriginalDL ? 0 : NO_DL_EXTRA_DEPOSIT);

  const subtotal = basePrice + extraHelmetCharge + mobileHolderCharge;
  const gstAmount = round2(subtotal * GST_RATE);
  const couponDiscount = Math.min(round2(rawDiscount), round2(subtotal + gstAmount));
  const totalAmount = round2(subtotal + gstAmount - couponDiscount + securityDeposit);

  return {
    basePrice,
    kmLimit,
    extraHelmetCount,
    extraHelmetCharge,
    mobileHolderCharge,
    securityDeposit,
    subtotal,
    gstAmount,
    couponDiscount,
    totalAmount,
    tier,
  };
}

export function computeCouponDiscount(params: {
  discount_type: 'percent' | 'fixed' | 'gst_waiver';
  discount_value: number;
  subtotal: number;
  gstAmount: number;
}): number {
  const { discount_type, discount_value, subtotal, gstAmount } = params;
  if (discount_type === 'gst_waiver') return round2(gstAmount);
  if (discount_type === 'percent') return round2(subtotal * discount_value / 100);
  return round2(Math.min(discount_value, subtotal + gstAmount));
}

/**
 * Given a start timestamp and a tier, compute the end timestamp.
 */
export function tierEndTs(startTs: Date, tier: PackageTier): Date {
  const d = new Date(startTs);
  d.setHours(d.getHours() + TIER_HOURS[tier]);
  return d;
}

/**
 * Split a total payment into vendor payout and platform commission.
 * NOTE: commission applies only to the rental portion, NOT the security deposit
 * or GST (GST is a passthrough to the government). Helmet addon is platform revenue.
 */
export function splitCommission(params: {
  basePrice: number;
  extraHelmetCharge: number;
  commissionPct: number;
}) {
  const { basePrice, extraHelmetCharge, commissionPct } = params;
  const commissionableAmount = basePrice; // vendor gets % of base rental only
  const platformCommission = round2(commissionableAmount * (commissionPct / 100));
  const vendorPayout = round2(commissionableAmount - platformCommission);
  // Platform also keeps the helmet charge in full
  const totalPlatformRevenue = round2(platformCommission + extraHelmetCharge);
  return { platformCommission: totalPlatformRevenue, vendorPayout };
}

/**
 * Late return / excess km calculation — used when admin closes out a booking.
 */
export function calculateReturnCharges(params: {
  kmUsed: number;
  kmLimit: number;
  lateHours: number;
  excessKmRate: number;
  lateHourlyPenalty: number;
}) {
  const { kmUsed, kmLimit, lateHours, excessKmRate, lateHourlyPenalty } = params;
  const excessKm = Math.max(0, kmUsed - kmLimit);
  const excessKmCharge = round2(excessKm * excessKmRate);
  const lateCharge = round2(Math.max(0, lateHours) * lateHourlyPenalty);
  return { excessKm, excessKmCharge, lateCharge, total: round2(excessKmCharge + lateCharge) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Store hours: 6:00 AM – 10:30 PM IST
export const STORE_OPEN_HOUR = 6;   // 6:00 AM
export const STORE_CLOSE_HOUR = 22; // 22:30 = 10:30 PM
export const STORE_CLOSE_MIN = 30;

export function isWithinStoreHours(d: Date): boolean {
  // Convert to IST
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000; // fixed UTC→IST offset (+5:30)
  const ist = new Date(istMs);
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes();

  if (h < STORE_OPEN_HOUR) return false;
  if (h > STORE_CLOSE_HOUR) return false;
  if (h === STORE_CLOSE_HOUR && m > STORE_CLOSE_MIN) return false;
  return true;
}
