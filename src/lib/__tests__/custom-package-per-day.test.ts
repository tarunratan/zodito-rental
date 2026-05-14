/**
 * Tests for per-day priced custom packages.
 *
 * Contract:
 *   • `per_day_price` non-null AND `customActualHours` provided
 *       → charge = ceil(hours/24) × per_day_price
 *       → km    = ceil(hours/24) × per_day_km_limit
 *   • `per_day_price` null (legacy fixed)
 *       → charge = customPackage.price, regardless of duration
 *   • `per_day_price` non-null but `customActualHours` not provided (any
 *     caller that hasn't been updated yet) → safe fallback to the fixed
 *     `price` column. Same as legacy.
 */

import { describe, it, expect } from 'vitest';
import { calculatePrice, type CustomPackage } from '../pricing';

function pkg(over: Partial<CustomPackage>): CustomPackage {
  return {
    id: 'cp-test',
    bike_id: 'b-1',
    label: 'Test',
    min_duration_hours: 168,
    duration_hours: 336,
    price: 2303,
    km_limit: 700,
    is_active: true,
    per_day_price: null,
    per_day_km_limit: null,
    ...over,
  };
}

describe('calculatePrice — per-day custom packages', () => {
  it('charges days × per_day_price for the actual booked hours', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: 329, per_day_km_limit: 100 }),
      customActualHours: 7 * 24, // exactly 7 days
      extraHelmetCount: 0,
      hasOriginalDL: true,
    });
    expect(r.basePrice).toBe(329 * 7);
    expect(r.kmLimit).toBe(100 * 7);
  });

  it('rounds up partial days (8.5 days → 9 days)', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: 329, per_day_km_limit: 100 }),
      customActualHours: 8 * 24 + 12, // 8.5 days
      extraHelmetCount: 0,
      hasOriginalDL: true,
    });
    expect(r.basePrice).toBe(329 * 9);
    expect(r.kmLimit).toBe(100 * 9);
  });

  it('charges max days at the upper bound of the range', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: 329, per_day_km_limit: 100 }),
      customActualHours: 14 * 24,
      extraHelmetCount: 0,
      hasOriginalDL: true,
    });
    expect(r.basePrice).toBe(329 * 14);
    expect(r.kmLimit).toBe(100 * 14);
  });

  it('falls back to fixed price when customActualHours is not provided', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: 329, per_day_km_limit: 100, price: 999, km_limit: 200 }),
      // no customActualHours — older callers
      extraHelmetCount: 0,
      hasOriginalDL: true,
    });
    expect(r.basePrice).toBe(999);
    expect(r.kmLimit).toBe(200);
  });

  it('legacy fixed customs (per_day_price null) still use the fixed price even when actualHours is passed', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: null, price: 2303, km_limit: 700 }),
      customActualHours: 10 * 24, // would have been 10 × per_day if it were per-day
      extraHelmetCount: 0,
      hasOriginalDL: true,
    });
    expect(r.basePrice).toBe(2303);
    expect(r.kmLimit).toBe(700);
  });

  it('still adds GST and extra helmet on top of the per-day base', () => {
    const r = calculatePrice({
      customPackage: pkg({ per_day_price: 100, per_day_km_limit: 100 }),
      customActualHours: 10 * 24,
      extraHelmetCount: 1,
      hasOriginalDL: true,
    });
    // base = 1000, helmet = 50, subtotal = 1050, GST = 189, total = 1239 (+ deposit handled separately)
    expect(r.basePrice).toBe(1000);
    expect(r.extraHelmetCharge).toBe(50);
    expect(r.subtotal).toBe(1050);
    expect(r.gstAmount).toBe(189);
  });
});
