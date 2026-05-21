/**
 * Tests for booking extension pricing.
 *
 * Locks in the contract:
 *   - Extension price = (new full-trip price) − (original full-trip price)
 *   - Extension km    = (new tier km_limit)   − (original km_limit)
 *   - Negative deltas clamp to zero
 *   - Boundary durations pick the correct bracket
 *   - Custom range packages take effect when their bound is tighter
 */

import { describe, it, expect } from 'vitest';
import { quoteExtension } from '../extension-pricing';
import type { PackageTier } from '../supabase/types';

const TIERS: PackageTier[] = [
  '12hr', '24hr', '36hr', '2day', '60hr', '3day', '96hr', '120hr', '144hr', '7day',
];

// Realistic admin-set prices: 12hr = 400 / 100km, 24hr = 600 / 140km, 36hr = 800/240, 2day=1000/280
const PACKAGES: { tier: PackageTier; price: number; km_limit: number }[] = [
  { tier: '12hr',  price: 400,  km_limit: 100 },
  { tier: '24hr',  price: 600,  km_limit: 140 },
  { tier: '36hr',  price: 800,  km_limit: 240 },
  { tier: '2day',  price: 1000, km_limit: 280 },
  { tier: '60hr',  price: 1200, km_limit: 380 },
  { tier: '3day',  price: 1400, km_limit: 420 },
  { tier: '96hr',  price: 1700, km_limit: 480 },
  { tier: '120hr', price: 2000, km_limit: 560 },
  { tier: '144hr', price: 2300, km_limit: 700 },
  { tier: '7day',  price: 2600, km_limit: 700 },
];

// Wall-clock IST → UTC Date.
function ist(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000);
}

describe('quoteExtension', () => {
  it('extending a 24h booking by 12h into the 36h bracket', () => {
    // Original: 24hrs at ₹600 base / ₹108 GST / 140 km
    // New total: 36hrs at ₹800 base / ₹144 GST / 240 km
    // Delta: base 200, gst 36, total 236, km +100
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 12, 10),
      newEndTs: ist(2026, 5, 12, 22),
      originalBasePrice: 600,
      originalGstAmount: 108,
      originalKmLimit: 140,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [],
    });
    if ('error' in r) throw new Error('Expected a quote, got error: ' + r.error);
    expect(r.extraHours).toBeCloseTo(12, 2);
    expect(r.baseDelta).toBe(200);
    // GST is waived on extensions — see extension-pricing.ts policy comment.
    expect(r.gstDelta).toBe(0);
    expect(r.totalDelta).toBe(200);
    expect(r.extraKm).toBe(100);
    expect(r.newKmLimit).toBe(240);
    expect(r.matchedTier).toBe('36hr');
  });

  it('extending into the 2day (48h) bracket', () => {
    // Original 24h, extending to 48h total
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 12, 10),
      newEndTs: ist(2026, 5, 13, 10),
      originalBasePrice: 600,
      originalGstAmount: 108,
      originalKmLimit: 140,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [],
    });
    if ('error' in r) throw new Error(r.error);
    expect(r.matchedTier).toBe('2day');
    expect(r.baseDelta).toBe(400);  // 1000 - 600
    expect(r.extraKm).toBe(140);    // 280 - 140
  });

  it('rejects an extension to the same or earlier drop-off', () => {
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 12, 10),
      newEndTs: ist(2026, 5, 12, 10), // same
      originalBasePrice: 600,
      originalGstAmount: 108,
      originalKmLimit: 140,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [],
    });
    expect('error' in r).toBe(true);
  });

  it('falls back to extra-only pricing when full-trip recomputation is cheaper than original', () => {
    // Customer overpaid for the original 10h trip (₹1500). Extending into 24h
    // would compute a cheaper full-trip price (₹600) — the OLD code clamped
    // the delta to ₹0 and let the customer extend for free. New behavior:
    // re-price the extra 14 hours as a fresh booking (24hr tier = ₹600/140km)
    // and use that as the delta so extension always costs the marginal time.
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 11, 20),
      newEndTs: ist(2026, 5, 12, 10),
      originalBasePrice: 1500,
      originalGstAmount: 270,
      originalKmLimit: 250,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [],
    });
    if ('error' in r) throw new Error(r.error);
    // Extra 14 hours → 24hr tier (covers 12-24) → ₹600 base, 140km.
    // GST is waived on extensions.
    expect(r.baseDelta).toBe(600);
    expect(r.gstDelta).toBe(0);
    expect(r.totalDelta).toBe(600);
    expect(r.extraKm).toBe(140);
    expect(r.newKmLimit).toBe(250 + 140); // original + extra
  });

  it('regression: 24h booking extended to 7+ days with a cheap long-stay custom package', () => {
    // Reproduces the production bug the user hit. Customer paid for 24h
    // at the 24hr tier (₹600/140km). Admin has a discounted "15days"
    // custom package covering 168-336h at ₹329 — much cheaper than the
    // 24hr standard rate. Extending from 24h to 176h matched that custom
    // and the OLD code returned ₹0 (negative-clamp).
    const customSevenToFourteen = {
      id: 'cp-15days', bike_id: 'b1', label: '15days',
      min_duration_hours: 168, duration_hours: 336,
      price: 329, km_limit: 100, is_active: true,
    };
    const r = quoteExtension({
      startTs: ist(2026, 5, 14, 14),         // 14 May 2 PM
      originalEndTs: ist(2026, 5, 15, 14),   // 15 May 2 PM (24h)
      newEndTs: ist(2026, 5, 21, 22),        // 21 May 10 PM → 176h total, +152h
      originalBasePrice: 600,
      originalGstAmount: 108,
      originalKmLimit: 140,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [customSevenToFourteen],
    });
    if ('error' in r) throw new Error(r.error);
    // Extension MUST cost something — extra-only fallback prices 152h.
    // 152h matches the same 15days custom (168-336? no, 152 falls in 144-168 = 7day).
    // 7day tier in PACKAGES = ₹2600 / 700km. So delta = full 7day price.
    expect(r.baseDelta).toBeGreaterThan(0);
    expect(r.totalDelta).toBeGreaterThan(0);
    expect(r.newKmLimit).toBeGreaterThan(140); // strictly more than original
  });

  it('returns error when no bracket can cover the duration', () => {
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 12, 10),
      newEndTs: ist(2026, 7, 11, 10), // ~60 days
      originalBasePrice: 600,
      originalGstAmount: 108,
      originalKmLimit: 140,
      availableTiers: ['12hr', '24hr'],
      packages: PACKAGES.filter(p => ['12hr','24hr'].includes(p.tier)),
      customPackages: [],
    });
    expect('error' in r).toBe(true);
  });

  it('uses a custom range package when it tightens the next bracket', () => {
    // Custom 36-44 hr package fills the gap between 36hr (standard) and 2day (48h standard).
    // For a 38hr total trip (12hr extra on top of 26hr) the custom wins.
    const r = quoteExtension({
      startTs: ist(2026, 5, 11, 10),
      originalEndTs: ist(2026, 5, 12, 12),
      newEndTs: ist(2026, 5, 13, 0),
      originalBasePrice: 800,
      originalGstAmount: 144,
      originalKmLimit: 240,
      availableTiers: TIERS,
      packages: PACKAGES,
      customPackages: [{
        id: 'cp1', bike_id: 'b1', label: 'Weekend Add-on',
        min_duration_hours: 36, duration_hours: 44,
        price: 900, km_limit: 320, is_active: true,
      }],
    });
    if ('error' in r) throw new Error(r.error);
    // Standard 2day would have been 1000 / 280 km. Custom 900 / 320 tightens the bracket and wins.
    expect(r.matchedTier).toBeNull();
    expect(r.baseDelta).toBe(100);
    expect(r.extraKm).toBe(80);
  });
});
