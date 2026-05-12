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

// ─────────────────────────────────────────────────────────────────────────────
// EXPLICIT RANGE TABLE — single source of truth for duration → tier matching.
//
// Each row defines a half-open interval `(min, max]` in hours. The matching
// algorithm uses STRICT lower bound + INCLUSIVE upper bound. This pins the
// boundary semantics the admin/customer expect:
//
//   • exactly 24.0 hrs   → (12, 24] → 24hr tier
//   • 24.1 hrs (or 24.5) → (24, 36] → 36hr tier
//   • exactly 48.0 hrs   → (36, 48] → 2day tier
//
// Adding/removing a row here is the ONLY thing required to introduce a new
// standard range bucket — no other file needs to change.
// ─────────────────────────────────────────────────────────────────────────────
export interface StandardRange {
  tier: PackageTier;
  /** Exclusive lower bound — strictly greater than `min`. */
  min: number;
  /** Inclusive upper bound — less than or equal to `max`. */
  max: number;
  getActualDays?: (hrs: number) => number;
}

export const STANDARD_RANGES: StandardRange[] = [
  { tier: '12hr',         min: 0,   max: 12  },
  { tier: '24hr',         min: 12,  max: 24  },
  { tier: '36hr',         min: 24,  max: 36  },
  // '2day' preferred over '48hr' at the (36, 48] interval (stable sort keeps 2day first)
  { tier: '2day',         min: 36,  max: 48  },
  { tier: '48hr',         min: 36,  max: 48  },
  { tier: '60hr',         min: 48,  max: 60  },
  // '3day' preferred over '72hr' at (60, 72]
  { tier: '3day',         min: 60,  max: 72  },
  { tier: '72hr',         min: 60,  max: 72  },
  { tier: '96hr',         min: 72,  max: 96  },
  { tier: '120hr',        min: 96,  max: 120 },
  { tier: '144hr',        min: 120, max: 144 },
  { tier: '7day',         min: 144, max: 168 },
  // weekly_flex: per-day pricing for 7–14 days (>168 hrs up to 336 hrs)
  { tier: 'weekly_flex',  min: 168, max: 336, getActualDays: hrs => Math.ceil(hrs / 24) },
  { tier: '15day',        min: 336, max: 360 },
  // monthly_flex: per-day pricing for 15–29 days (>360 hrs up to 696 hrs)
  { tier: 'monthly_flex', min: 360, max: 696, getActualDays: hrs => Math.ceil(hrs / 24) },
  { tier: '30day',        min: 696, max: 720 },
];

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE-SOURCE MERGE — admin override priority + UNION semantics
//
// The customer-facing price list for a bike is built from TWO database tables:
//
//   • bike_model_packages — model-level defaults (seeded; may not include every
//     standard tier — historically only 12hr / 24hr / 7day / 15day / 30day).
//   • bike_packages       — per-bike admin overrides (any subset of tiers).
//
// `mergeBikePackages` returns the UNION of both — every tier that exists in
// EITHER source ends up in the result, with override values winning when both
// sources have a row for the same tier.
//
// The historical merge logic (`modelPackages.map(mp => override-or-default)`)
// was a left-join: tiers present ONLY in `bike_packages` were silently dropped.
// That hid admin price edits for tiers (36hr, 2day, 60hr, 3day, etc.) that
// were never seeded at the model level — the symptom users hit as
// "tier 1–2 updates propagate, tier 3+ don't".
// ─────────────────────────────────────────────────────────────────────────────
export interface BikePackagePrice {
  tier: PackageTier;
  price: number;
  km_limit: number;
}

export function mergeBikePackages(
  modelPackages: Array<{ tier: PackageTier; price: number | string; km_limit: number }>,
  overrides:    Array<{ tier: PackageTier; price: number | string; km_limit: number }>,
): BikePackagePrice[] {
  const byTier = new Map<PackageTier, BikePackagePrice>();
  for (const mp of modelPackages ?? []) {
    byTier.set(mp.tier, { tier: mp.tier, price: Number(mp.price), km_limit: Number(mp.km_limit) });
  }
  // Overrides win — `.set` replaces any model-level row at the same tier.
  for (const ov of overrides ?? []) {
    byTier.set(ov.tier, { tier: ov.tier, price: Number(ov.price), km_limit: Number(ov.km_limit) });
  }
  return Array.from(byTier.values());
}

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
 * Find the explicit `(min, max]` range that covers an arbitrary rental duration.
 *
 * Matching rule (the contract the admin & customer see in the UI):
 *
 *     min < durationHours <= max
 *
 * That is: the lower bound is STRICT, the upper bound is INCLUSIVE. This pins
 * the boundary cases:
 *   • exactly 24.0 hrs    → 24hr tier (in (12, 24])
 *   • 24.1 / 24.5 / 25 hrs → 36hr tier (in (24, 36])
 *
 * When multiple ranges cover the same duration (e.g. `2day` and a custom
 * `36–44` package both contain 38h), the one with the **smaller max** wins.
 * At an exact tie, stable sort preserves the order in which we appended
 * candidates: standard ranges first, then customs, then per-day synthetics.
 *
 * Custom packages are matched purely from the admin-set
 * `(min_duration_hours, duration_hours]` columns on the `custom_packages`
 * table — no implicit re-bounding.
 *
 * Synthetic 24hr×N day fallback is used only when no explicit standard range
 * covers (e.g. bike has 12hr + 24hr + 7day but no intermediate tiers).
 *
 * Logs a `[pricing.coveringTier]` diagnostic line when `DEBUG_PRICING=1`.
 */
export function coveringTier(
  durationHours: number,
  availableTiers: PackageTier[],
  customPackages: CustomPackage[] = []
): TierResult | null {
  if (durationHours <= 0) return null;
  const debug = typeof process !== 'undefined' && process.env?.DEBUG_PRICING === '1';

  type Bracket = {
    min: number;
    max: number;
    source: 'standard' | 'custom' | 'synthetic';
    label: string;
    build: () => TierResult;
  };

  const brackets: Bracket[] = [];

  // 1) Explicit standard ranges — only those this bike actually has packages for.
  for (const r of STANDARD_RANGES) {
    if (!availableTiers.includes(r.tier)) continue;
    brackets.push({
      min: r.min,
      max: r.max,
      source: 'standard',
      label: r.tier,
      build: () => ({ type: 'standard', tier: r.tier, actualDays: r.getActualDays?.(durationHours) }),
    });
  }

  // 2) Admin-created custom range packages — fully driven by their own (min, max].
  for (const p of customPackages) {
    if (!p.is_active) continue;
    brackets.push({
      min: p.min_duration_hours ?? 0,
      max: p.duration_hours,
      source: 'custom',
      label: `custom:${p.label}`,
      build: () => ({ type: 'custom', pkg: p }),
    });
  }

  // 3) Synthetic 24hr × N-day fallback (only when 24hr is configured). Covers
  //    gaps when admin defined 12hr / 24hr / 7day but skipped 36hr / 2day / 60hr / 3day.
  if (availableTiers.includes('24hr')) {
    for (const d of [2, 3, 4, 5, 6]) {
      brackets.push({
        min: (d - 1) * 24,
        max: d * 24,
        source: 'synthetic',
        label: `24hr×${d}d`,
        build: () => ({ type: 'standard', tier: '24hr' as PackageTier, actualDays: d }),
      });
    }
  }

  // Sort by `max` ascending — first match wins. Stable sort keeps the source
  // ordering above at ties: standard > custom > synthetic.
  brackets.sort((a, b) => a.max - b.max);

  if (debug) {
    console.log('[pricing.coveringTier] candidates', {
      durationHours,
      ranges: brackets.map(b => ({ label: b.label, min: b.min, max: b.max })),
    });
  }

  for (const b of brackets) {
    // STRICT lower bound + INCLUSIVE upper bound — the contract above.
    if (durationHours > b.min && durationHours <= b.max) {
      if (debug) {
        console.log('[pricing.coveringTier] matched', {
          durationHours,
          matched: b.label,
          range: `(${b.min}, ${b.max}]`,
        });
      }
      return b.build();
    }
  }
  if (debug) console.log('[pricing.coveringTier] no match', { durationHours });
  return null;
}

/**
 * Pure tier-selection helper — picks the explicit `(min, max]` range that
 * covers a rental duration. Identical to `coveringTier`; exported under
 * this name for callers that want the spec's signature.
 *
 *     totalHours = differenceInHours(dropoffDate, pickupDate)
 *     const tier = getApplicableTier(totalHours, availableTiers, customPackages)
 *
 * Returns `null` when no admin-configured tier covers the duration (callers
 * must surface "no package available for this duration" — never fall back
 * to a hardcoded longer-duration price).
 */
export function getApplicableTier(
  totalHours: number,
  availableTiers: PackageTier[],
  customPackages: CustomPackage[] = []
): TierResult | null {
  return coveringTier(totalHours, availableTiers, customPackages);
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
  // Accept any row with the minimum shape the function reads. Lets callers
  // pass the merged `mergeBikePackages` output (which has no `id`/`model_id`)
  // alongside raw `BikeModelPackage[]` rows.
  packages?: Array<Pick<BikeModelPackage, 'tier' | 'price' | 'km_limit'>>;
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

// ── IST helpers (used only here; IST = UTC+5:30) ──────────────────────────────
function _istComponents(d: Date): { year: number; month: number; date: number; hours: number; minutes: number } {
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    year:    shifted.getUTCFullYear(),
    month:   shifted.getUTCMonth(),
    date:    shifted.getUTCDate(),
    hours:   shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

// Build a UTC Date from IST wall-clock components.
function _fromIST(year: number, month: number, date: number, hours: number, minutes = 0): Date {
  return new Date(Date.UTC(year, month, date, hours, minutes) - 5.5 * 60 * 60 * 1000);
}
// ─────────────────────────────────────────────────────────────────────────────

/** Shape returned by calculate12HourSlot. */
export interface TwelveHrSlot {
  dropTime: Date;
  /** Actual rental hours for this slot (may be < 12 for midday pickups). */
  durationHours: number;
  zone: 'morning' | 'midday' | 'evening';
}

/**
 * Canonical 12-hour rental slot calculator — single source of truth.
 *
 * Rules (IST wall-clock hours):
 *   Zone 1 — Morning  6 AM – 10 AM  → drop = pickup + 12 hrs
 *   Zone 2 — Midday  11 AM –  5 PM  → drop = same day 10 PM IST (store close)
 *   Zone 3 — Evening  6 PM – 10 PM  → drop = pickup + 12 hrs (next morning)
 *
 * Works correctly on both client (browser/IST) and server (Node/UTC) because
 * all hour comparisons are done in IST, not in local or UTC time.
 */
export function calculate12HourSlot(pickupTs: Date): TwelveHrSlot {
  const ist = _istComponents(pickupTs);
  const h   = ist.hours;

  if (h >= 11 && h < 18) {
    // Zone 2: midday — fixed 10 PM IST same calendar day
    const dropTime     = _fromIST(ist.year, ist.month, ist.date, STORE_CLOSE_HOUR);
    const durationHours = (dropTime.getTime() - pickupTs.getTime()) / 3_600_000;
    return { dropTime, durationHours, zone: 'midday' };
  }

  // Zone 1 (6–10 AM) and Zone 3 (6–10 PM): pickup + 12 hours
  const dropTime = new Date(pickupTs.getTime() + 12 * 3_600_000);
  const zone: TwelveHrSlot['zone'] = h <= 10 ? 'morning' : 'evening';
  return { dropTime, durationHours: 12, zone };
}

/** Returns just the drop-off Date for a 12hr booking. */
export function twelveHrReturn(pickupTs: Date): Date {
  return calculate12HourSlot(pickupTs).dropTime;
}

export function tierEndTs(startTs: Date, tier: PackageTier, actualDays?: number): Date {
  if (tier === '12hr') {
    return calculate12HourSlot(startTs).dropTime;
  }
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
