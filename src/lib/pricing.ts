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

// Canonical order for admin pricing panel — exactly the 10 tiers shown in the UI
export const TIER_ORDER: PackageTier[] = [
  '12hr', '24hr', '36hr', '2day', '60hr', '3day', '96hr', '120hr', '144hr', '7day',
];

// Admin-only descriptive labels with duration range + suggested km defaults
export const ADMIN_TIER_LABELS: Partial<Record<PackageTier, string>> = {
  '12hr':  '1hr – 12 hrs  /  100 km',
  '24hr':  '12hrs – 24 hrs  /  140 km',
  '36hr':  '24 hrs – 36hrs  /  240 km',
  '2day':  '36hrs – 48hrs  /  280 km',
  '60hr':  '48hrs – 60hrs  /  380 km',
  '3day':  '60hrs – 72hrs  /  420 km',
  '96hr':  '72hrs – 96hrs  /  420 km',
  '120hr': '96hrs – 120hrs  /  560 km',
  '144hr': '120hrs – 144hrs  /  700 km',
  '7day':  '7 days  /  700 km',
};

export const FLEX_TIER_RANGES: Record<'weekly_flex' | 'monthly_flex', { min: number; max: number }> = {
  weekly_flex:  { min: 7,  max: 14 },
  monthly_flex: { min: 15, max: 29 },
};

export function isFlexTier(tier: PackageTier): tier is 'weekly_flex' | 'monthly_flex' {
  return tier === 'weekly_flex' || tier === 'monthly_flex';
}

// Ordered brackets used to find the smallest tier that covers an arbitrary duration.
// Fixed tiers are exact; flex tiers fill gaps between fixed anchors.
const COVERING_BRACKETS: Array<{
  tier: PackageTier;
  maxHours: number;
  getActualDays?: (hrs: number) => number;
}> = [
  { tier: '12hr',         maxHours: 12  },
  { tier: '24hr',         maxHours: 24  },
  { tier: '36hr',         maxHours: 36  },
  // '2day' preferred over '48hr' at 48hrs (same maxHours; stable sort keeps 2day first)
  { tier: '2day',         maxHours: 48  },
  { tier: '48hr',         maxHours: 48  },
  { tier: '60hr',         maxHours: 60  },
  // '3day' preferred over '72hr' at 72hrs
  { tier: '3day',         maxHours: 72  },
  { tier: '72hr',         maxHours: 72  },
  { tier: '96hr',         maxHours: 96  },
  { tier: '120hr',        maxHours: 120 },
  { tier: '144hr',        maxHours: 144 },
  { tier: '7day',         maxHours: 168 },
  // weekly_flex: per-day pricing for 7–14 days (>168 hrs up to 336 hrs)
  { tier: 'weekly_flex',  maxHours: 336, getActualDays: hrs => Math.ceil(hrs / 24) },
  { tier: '15day',        maxHours: 360 },
  // monthly_flex: per-day pricing for 15–29 days (>360 hrs up to 696 hrs)
  { tier: 'monthly_flex', maxHours: 696, getActualDays: hrs => Math.ceil(hrs / 24) },
  { tier: '30day',        maxHours: 720 },
];

/** Admin-defined custom duration package stored in `custom_packages` table. */
export interface CustomPackage {
  id: string;
  bike_id: string;
  label: string;
  min_duration_hours: number;  // lower bound (0 = from the start)
  duration_hours: number;      // upper bound
  price: number;
  km_limit: number;
  is_active: boolean;
}

/** Discriminated union returned by coveringTier — either a standard predefined tier
 *  or an admin-created custom-duration package. */
export type TierResult =
  | { type: 'standard'; tier: PackageTier; actualDays?: number }
  | { type: 'custom';   pkg: CustomPackage };

/**
 * Given an actual rental duration, finds the smallest bracket that covers it.
 * Custom packages (exact durations) are merged into the bracket list and take
 * priority when they are an exact or near-exact fit over a longer standard tier.
 * Returns null if duration is 0 or exceeds all available options.
 */
export function coveringTier(
  durationHours: number,
  availableTiers: PackageTier[],
  customPackages: CustomPackage[] = []
): TierResult | null {
  if (durationHours <= 0) return null;

  type Bracket = { maxHours: number; result: () => TierResult };

  // Explicit tier brackets this bike has priced (always take priority)
  const explicitBrackets: Bracket[] = COVERING_BRACKETS
    .filter(b => availableTiers.includes(b.tier))
    .map(b => ({
      maxHours: b.maxHours,
      result: (): TierResult => ({
        type: 'standard' as const,
        tier: b.tier,
        actualDays: b.getActualDays?.(durationHours),
      }),
    }));

  // Synthetic per-day brackets for 2–6 days using the 24hr base price × days.
  // Fills the gap when a bike has 12hr/24hr/7day but no intermediate tiers.
  // Explicit brackets with the same maxHours override these (stable sort puts explicit first).
  const syntheticBrackets: Bracket[] = availableTiers.includes('24hr')
    ? [2, 3, 4, 5, 6].map(d => ({
        maxHours: d * 24,
        result: (): TierResult => ({
          type: 'standard' as const,
          tier: '24hr' as PackageTier,
          actualDays: d,
        }),
      }))
    : [];

  // Admin-created custom packages — range bracket [min_duration_hours, duration_hours]
  const customBrackets: Bracket[] = customPackages
    .filter(p => p.is_active && durationHours >= (p.min_duration_hours ?? 0))
    .map(p => ({
      maxHours: p.duration_hours,
      result: (): TierResult => ({ type: 'custom' as const, pkg: p }),
    }));

  // Sort ascending; explicit brackets come before synthetic at same maxHours (stable sort)
  const brackets = [...explicitBrackets, ...customBrackets, ...syntheticBrackets]
    .sort((a, b) => a.maxHours - b.maxHours);

  for (const b of brackets) {
    if (durationHours <= b.maxHours) return b.result();
  }
  return null;
}

export function formatDuration(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d === 0) return `${h} hr${h !== 1 ? 's' : ''}`;
  if (h === 0) return `${d} day${d !== 1 ? 's' : ''}`;
  return `${d}d ${h}h`;
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
  tier: PackageTier | null;       // null when a custom package is used
  customPackageId?: string;
  customPackageLabel?: string;
  actualDays?: number;
}

export function calculatePrice(params: {
  packages?: BikeModelPackage[];
  tier?: PackageTier;
  customPackage?: CustomPackage;   // use instead of tier for admin-created packages
  actualDays?: number;             // required for weekly_flex / monthly_flex
  extraHelmetCount?: number;
  hasOriginalDL?: boolean;
  includeMobileHolder?: boolean;
  couponDiscount?: number;
}): PriceBreakdown {
  const {
    packages, tier, customPackage, actualDays,
    extraHelmetCount = 0, hasOriginalDL = true,
    includeMobileHolder = false, couponDiscount: rawDiscount = 0,
  } = params;

  let basePrice: number;
  let kmLimit: number;

  if (customPackage) {
    basePrice = round2(Number(customPackage.price));
    kmLimit   = customPackage.km_limit;
  } else if (tier && packages) {
    const pkg = packages.find(p => p.tier === tier);
    if (!pkg) throw new Error(`No package found for tier ${tier}`);

    // Multiply by actualDays for flex tiers AND for the 24hr-per-day synthetic fallback (actualDays > 1)
    if (actualDays && actualDays > 0 && (isFlexTier(tier) || actualDays > 1)) {
      basePrice = round2(Number(pkg.price) * actualDays);
      kmLimit   = Math.round(pkg.km_limit * actualDays);
    } else {
      basePrice = Number(pkg.price);
      kmLimit   = pkg.km_limit;
    }
  } else {
    throw new Error('Either (packages + tier) or customPackage must be provided');
  }

  const extraHelmetCharge   = extraHelmetCount * EXTRA_HELMET_PRICE;
  const mobileHolderCharge  = includeMobileHolder ? MOBILE_HOLDER_PRICE : 0;
  const securityDeposit     = DEFAULT_SECURITY_DEPOSIT + (hasOriginalDL ? 0 : NO_DL_EXTRA_DEPOSIT);
  const subtotal            = basePrice + extraHelmetCharge + mobileHolderCharge;
  const gstAmount           = round2(subtotal * GST_RATE);
  const couponDiscount      = Math.min(round2(rawDiscount), round2(subtotal + gstAmount));
  // Security deposit is always collected at pickup (cash/UPI) — never charged online.
  const totalAmount         = round2(subtotal + gstAmount - couponDiscount);

  return {
    basePrice, kmLimit, extraHelmetCount, extraHelmetCharge,
    mobileHolderCharge, securityDeposit, subtotal, gstAmount,
    couponDiscount, totalAmount,
    tier: tier ?? null,
    ...(customPackage ? { customPackageId: customPackage.id, customPackageLabel: customPackage.label } : {}),
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
  // Use actualDays for flex tiers and for the synthetic per-day 24hr rate (actualDays > 1)
  if (actualDays && actualDays > 0 && (isFlexTier(tier) || actualDays > 1)) {
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
