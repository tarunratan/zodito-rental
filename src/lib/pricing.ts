// ============================================================================
// PRICING ENGINE
// ============================================================================

import type {
  BikeModel,
  BikeModelPackage,
  PackageTier,
} from './supabase/types';

export type { PackageTier };

export const GST_RATE = 0.18;
export const DEFAULT_SECURITY_DEPOSIT = 500;
export const NO_DL_EXTRA_DEPOSIT = 500;
export const EXTRA_HELMET_PRICE = 50;
export const MOBILE_HOLDER_PRICE = 49;

// Fixed-duration tiers — hours of rental
export const TIER_HOURS: Record<PackageTier, number> = {
  '6hr':   6,
  '12hr':  12,
  '24hr':  24,
  '36hr':  36,
  '48hr':  48,
  '60hr':  60,
  '72hr':  72,
  '96hr':  96,
  '120hr': 120,
  '144hr': 144,
  '2day':  48,
  '3day':  72,
  '7day':  168,
  '15day': 360,
  '30day': 720,
  // Flex tiers — actual duration set by actualDays param
  'weekly_flex':  0,
  'monthly_flex': 0,
};

export const TIER_LABELS: Record<PackageTier, string> = {
  '6hr':   '6 Hours',
  '12hr':  '12 Hours',
  '24hr':  '24 Hours',
  '36hr':  '36 Hours',
  '48hr':  '2 Days (48 hrs)',
  '60hr':  '60 Hours',
  '72hr':  '3 Days (72 hrs)',
  '96hr':  '4 Days',
  '120hr': '5 Days',
  '144hr': '6 Days',
  '2day':  '2 Days',
  '3day':  '3 Days',
  '7day':  '7 Days',
  '15day': '15 Days',
  '30day': '30 Days',
  'weekly_flex':  'Weekly (7-14 days)',
  'monthly_flex': 'Monthly (15-29 days)',
};

// Canonical order for admin/picker
export const TIER_ORDER: PackageTier[] = [
  '12hr', '24hr', '36hr', '48hr', '60hr', '72hr', '96hr', '120hr', '144hr',
  '7day', 'weekly_flex', '15day', 'monthly_flex', '30day',
];

export const FLEX_TIER_RANGES: Record<'weekly_flex' | 'monthly_flex', { min: number; max: number }> = {
  weekly_flex:  { min: 7,  max: 14 },
  monthly_flex: { min: 15, max: 29 },
};

export function isFlexTier(tier: PackageTier): tier is 'weekly_flex' | 'monthly_flex' {
  return tier === 'weekly_flex' || tier === 'monthly_flex';
}

export function isWeekendIST(d: Date): boolean {
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay();
  return day === 0 || day === 6;
}

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
  subtotal: number;
  gstAmount: number;
  couponDiscount: number;
  totalAmount: number;
  tier: PackageTier;
  actualDays?: number;
}

export function calculatePrice(params: {
  packages: BikeModelPackage[];
  tier: PackageTier;
  actualDays?: number;      // required for weekly_flex / monthly_flex
  extraHelmetCount?: number;
  hasOriginalDL?: boolean;
  includeMobileHolder?: boolean;
  couponDiscount?: number;
}): PriceBreakdown {
  const {
    packages, tier, actualDays,
    extraHelmetCount = 0, hasOriginalDL = true,
    includeMobileHolder = false, couponDiscount: rawDiscount = 0,
  } = params;

  const pkg = packages.find(p => p.tier === tier);
  if (!pkg) throw new Error(`No package found for tier ${tier}`);

  let basePrice: number;
  let kmLimit: number;

  if (isFlexTier(tier) && actualDays && actualDays > 0) {
    // For flex tiers: price field = per_day_rate, km_limit = km_per_day
    basePrice = round2(Number(pkg.price) * actualDays);
    kmLimit   = Math.round(pkg.km_limit * actualDays);
  } else {
    basePrice = Number(pkg.price);
    kmLimit   = pkg.km_limit;
  }

  const extraHelmetCharge   = extraHelmetCount * EXTRA_HELMET_PRICE;
  const mobileHolderCharge  = includeMobileHolder ? MOBILE_HOLDER_PRICE : 0;
  const securityDeposit     = DEFAULT_SECURITY_DEPOSIT + (hasOriginalDL ? 0 : NO_DL_EXTRA_DEPOSIT);
  const subtotal            = basePrice + extraHelmetCharge + mobileHolderCharge;
  const gstAmount           = round2(subtotal * GST_RATE);
  const couponDiscount      = Math.min(round2(rawDiscount), round2(subtotal + gstAmount));
  const totalAmount         = round2(subtotal + gstAmount - couponDiscount + securityDeposit);

  return {
    basePrice, kmLimit, extraHelmetCount, extraHelmetCharge,
    mobileHolderCharge, securityDeposit, subtotal, gstAmount,
    couponDiscount, totalAmount, tier,
    ...(actualDays ? { actualDays } : {}),
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

export function tierEndTs(startTs: Date, tier: PackageTier, actualDays?: number): Date {
  const d = new Date(startTs);
  if (isFlexTier(tier) && actualDays && actualDays > 0) {
    d.setHours(d.getHours() + actualDays * 24);
  } else {
    d.setHours(d.getHours() + TIER_HOURS[tier]);
  }
  return d;
}

export function splitCommission(params: {
  basePrice: number;
  extraHelmetCharge: number;
  commissionPct: number;
}) {
  const { basePrice, extraHelmetCharge, commissionPct } = params;
  const platformCommission = round2(basePrice * (commissionPct / 100));
  const vendorPayout       = round2(basePrice - platformCommission);
  return { platformCommission: round2(platformCommission + extraHelmetCharge), vendorPayout };
}

export function calculateReturnCharges(params: {
  kmUsed: number;
  kmLimit: number;
  lateHours: number;
  excessKmRate: number;
  lateHourlyPenalty: number;
}) {
  const { kmUsed, kmLimit, lateHours, excessKmRate, lateHourlyPenalty } = params;
  const excessKm      = Math.max(0, kmUsed - kmLimit);
  const excessKmCharge = round2(excessKm * excessKmRate);
  const lateCharge     = round2(Math.max(0, lateHours) * lateHourlyPenalty);
  return { excessKm, excessKmCharge, lateCharge, total: round2(excessKmCharge + lateCharge) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const STORE_OPEN_HOUR  = 6;
export const STORE_CLOSE_HOUR = 22;
export const STORE_CLOSE_MIN  = 30;

export function isWithinStoreHours(d: Date): boolean {
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist   = new Date(istMs);
  const h     = ist.getUTCHours();
  const m     = ist.getUTCMinutes();
  if (h < STORE_OPEN_HOUR)  return false;
  if (h > STORE_CLOSE_HOUR) return false;
  if (h === STORE_CLOSE_HOUR && m > STORE_CLOSE_MIN) return false;
  return true;
}
