/**
 * Tests for coupon eligibility rules.
 *
 * Covers the three usage scopes plus happy-hour windows and weekday filters.
 * All times are constructed in IST so the suite is timezone-agnostic.
 */

import { describe, it, expect } from 'vitest';
import {
  isCouponInActiveWindow,
  isCouponUsable,
  type CouponRecord,
} from '../coupon-eligibility';

/** Wall-clock IST → UTC Date. */
function ist(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000);
}

function baseCoupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'c1',
    code: 'TEST',
    label: 'Test',
    discount_type: 'percent',
    discount_value: 10,
    max_uses: null,
    used_count: 0,
    expires_at: null,
    active_from: null,
    is_active: true,
    usage_scope: 'one_per_user',
    time_window_start: null,
    time_window_end: null,
    valid_weekdays: null,
    ...overrides,
  };
}

describe('isCouponInActiveWindow', () => {
  const now = ist(2026, 5, 11, 12, 0); // 2026-05-11 12:00 IST — a Monday

  it('rejects inactive coupon', () => {
    const r = isCouponInActiveWindow(baseCoupon({ is_active: false }), now);
    expect(r.eligible).toBe(false);
  });

  it('rejects expired coupon', () => {
    const r = isCouponInActiveWindow(baseCoupon({ expires_at: ist(2026, 5, 10, 12).toISOString() }), now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });

  it('rejects not-yet-active coupon', () => {
    const r = isCouponInActiveWindow(baseCoupon({ active_from: ist(2026, 5, 12, 12).toISOString() }), now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/not active yet/);
  });

  it('accepts coupon with no schedule', () => {
    expect(isCouponInActiveWindow(baseCoupon(), now).eligible).toBe(true);
  });

  it('rejects coupon when current IST day is not in valid_weekdays', () => {
    // Monday = 1; permit only weekends.
    const r = isCouponInActiveWindow(baseCoupon({ valid_weekdays: [0, 6] }), now);
    expect(r.eligible).toBe(false);
  });

  it('accepts coupon when current IST day matches valid_weekdays', () => {
    const r = isCouponInActiveWindow(baseCoupon({ valid_weekdays: [1, 2, 3] }), now);
    expect(r.eligible).toBe(true);
  });

  it('accepts coupon inside a normal time window', () => {
    // 12:00 IST is inside 10:00–14:00.
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '10:00', time_window_end: '14:00' }), now);
    expect(r.eligible).toBe(true);
  });

  it('rejects coupon outside a normal time window', () => {
    // 12:00 IST is outside 18:00–21:00.
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '18:00', time_window_end: '21:00' }), now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/happy hours/);
  });

  it('handles an overnight window (22:00 → 02:00) — 23:00 IST is inside', () => {
    const late = ist(2026, 5, 11, 23, 0);
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '22:00', time_window_end: '02:00' }), late);
    expect(r.eligible).toBe(true);
  });

  it('handles an overnight window (22:00 → 02:00) — 01:30 IST next day is inside', () => {
    const earlyMorning = ist(2026, 5, 12, 1, 30);
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '22:00', time_window_end: '02:00' }), earlyMorning);
    expect(r.eligible).toBe(true);
  });

  it('handles an overnight window (22:00 → 02:00) — 12:00 IST is OUTSIDE', () => {
    const noon = ist(2026, 5, 11, 12, 0);
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '22:00', time_window_end: '02:00' }), noon);
    expect(r.eligible).toBe(false);
  });

  it('accepts boundary start (exact start minute)', () => {
    const at10 = ist(2026, 5, 11, 10, 0);
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '10:00', time_window_end: '14:00' }), at10);
    expect(r.eligible).toBe(true);
  });

  it('rejects boundary end (exact end minute is exclusive)', () => {
    const at14 = ist(2026, 5, 11, 14, 0);
    const r = isCouponInActiveWindow(baseCoupon({ time_window_start: '10:00', time_window_end: '14:00' }), at14);
    expect(r.eligible).toBe(false);
  });
});

describe('isCouponUsable — usage scope', () => {
  const now = ist(2026, 5, 11, 12, 0);

  it('one_per_user blocks repeat use', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: 'one_per_user' }), { hasUsedBefore: true, hasPriorBookings: false }, now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/already used/);
  });

  it('one_per_user allows first use', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: 'one_per_user' }), { hasUsedBefore: false, hasPriorBookings: true }, now);
    expect(r.eligible).toBe(true);
  });

  it('unlimited_per_user IGNORES hasUsedBefore (the regression scenario)', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: 'unlimited_per_user' }), { hasUsedBefore: true, hasPriorBookings: true }, now);
    expect(r.eligible).toBe(true);
  });

  it('unlimited_per_user still respects the global max_uses cap', () => {
    const r = isCouponUsable(
      baseCoupon({ usage_scope: 'unlimited_per_user', max_uses: 10, used_count: 10 }),
      { hasUsedBefore: false, hasPriorBookings: false },
      now,
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/usage limit/);
  });

  it('first_booking_only blocks user with prior bookings', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: 'first_booking_only' }), { hasUsedBefore: false, hasPriorBookings: true }, now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/first-time/);
  });

  it('first_booking_only allows brand-new user', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: 'first_booking_only' }), { hasUsedBefore: false, hasPriorBookings: false }, now);
    expect(r.eligible).toBe(true);
  });

  it('respects time-window even with unlimited scope', () => {
    const r = isCouponUsable(
      baseCoupon({ usage_scope: 'unlimited_per_user', time_window_start: '18:00', time_window_end: '21:00' }),
      { hasUsedBefore: false, hasPriorBookings: false },
      now, // 12:00 IST
    );
    expect(r.eligible).toBe(false);
  });

  it('treats null usage_scope as one_per_user (back-compat)', () => {
    const r = isCouponUsable(baseCoupon({ usage_scope: null as any }), { hasUsedBefore: true, hasPriorBookings: false }, now);
    expect(r.eligible).toBe(false);
  });
});
