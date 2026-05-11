/**
 * Single source of truth for coupon eligibility checks.
 *
 * Encodes the rules the admin can configure on a coupon:
 *   • `usage_scope`            – per-user redemption cap
 *   • `is_active` / `expires_at` / `active_from` – activation window
 *   • `time_window_start/end`  – wall-clock IST happy-hour window
 *   • `valid_weekdays`         – day-of-week filter (IST)
 *   • `max_uses` / `used_count`– global cap
 *
 * Used by the customer-facing `/api/coupons/available` listing and the
 * `/api/coupons/validate` validation route, plus the create endpoints.
 */

export type CouponUsageScope = 'one_per_user' | 'unlimited_per_user' | 'first_booking_only';

export interface CouponRecord {
  id: string;
  code: string;
  label?: string | null;
  discount_type: 'percent' | 'fixed' | 'gst_waiver' | string;
  discount_value: number | string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active_from?: string | null;
  is_active: boolean;
  usage_scope?: CouponUsageScope | null;
  time_window_start?: string | null; // 'HH:MM:SS' (IST)
  time_window_end?:   string | null; // 'HH:MM:SS' (IST)
  valid_weekdays?:    number[] | null; // 0 (Sun) ... 6 (Sat) — IST
}

export interface UserUsageContext {
  /** Has this user redeemed this coupon at least once before? */
  hasUsedBefore: boolean;
  /** Has this user completed any non-cancelled bookings before? */
  hasPriorBookings: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/** Convert UTC Date to IST wall-clock parts (hour, minute, weekday). */
function istParts(d: Date): { minutes: number; weekday: number } {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  // getUTCDay on the shifted instant gives the IST weekday (0=Sun..6=Sat)
  const weekday = ist.getUTCDay();
  return { minutes, weekday };
}

/** Parse 'HH:MM' or 'HH:MM:SS' → total minutes since midnight. */
function parseTimeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** Is `now` within the [start, end) window? Handles overnight (start > end). */
function withinTimeWindow(nowMin: number, start: number, end: number): boolean {
  if (start === end) return false;            // empty window
  if (start < end)   return nowMin >= start && nowMin < end;
  // Overnight window: e.g. 22:00 → 02:00 means 22:00–23:59 OR 00:00–02:00.
  return nowMin >= start || nowMin < end;
}

/** Pure schedule check — does this coupon's time-window admit `now`? */
export function isCouponInActiveWindow(c: CouponRecord, now: Date = new Date()): EligibilityResult {
  if (!c.is_active) return { eligible: false, reason: 'This coupon is no longer active' };
  if (c.active_from && new Date(c.active_from) > now) {
    return { eligible: false, reason: 'This coupon is not active yet' };
  }
  if (c.expires_at && new Date(c.expires_at) < now) {
    return { eligible: false, reason: 'This coupon has expired' };
  }

  const { minutes: nowMin, weekday } = istParts(now);

  if (c.valid_weekdays && c.valid_weekdays.length > 0 && !c.valid_weekdays.includes(weekday)) {
    return { eligible: false, reason: 'This coupon is not valid today' };
  }

  if (c.time_window_start && c.time_window_end) {
    const s = parseTimeToMinutes(c.time_window_start);
    const e = parseTimeToMinutes(c.time_window_end);
    if (s == null || e == null) {
      return { eligible: false, reason: 'Coupon time window is misconfigured' };
    }
    if (!withinTimeWindow(nowMin, s, e)) {
      return { eligible: false, reason: 'This coupon is only valid during happy hours' };
    }
  }

  return { eligible: true };
}

/** Full per-user eligibility. Includes window + scope + global cap. */
export function isCouponUsable(
  c: CouponRecord,
  user: UserUsageContext,
  now: Date = new Date(),
): EligibilityResult {
  const window = isCouponInActiveWindow(c, now);
  if (!window.eligible) return window;

  if (c.max_uses !== null && c.used_count >= c.max_uses) {
    return { eligible: false, reason: 'This coupon has reached its usage limit' };
  }

  const scope: CouponUsageScope = (c.usage_scope ?? 'one_per_user') as CouponUsageScope;

  if (scope === 'first_booking_only' && user.hasPriorBookings) {
    return { eligible: false, reason: 'This coupon is only for first-time customers' };
  }
  if (scope === 'one_per_user' && user.hasUsedBefore) {
    return { eligible: false, reason: 'You have already used this coupon' };
  }
  // unlimited_per_user → no per-user cap; only the global `max_uses` (above) applies.

  return { eligible: true };
}
