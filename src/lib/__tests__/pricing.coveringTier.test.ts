/**
 * Tests for `coveringTier` — the bracket-matching logic that decides which
 * admin-priced tier applies to an arbitrary rental duration.
 *
 * Contract pinned here (strict lower, inclusive upper — `min < d <= max`):
 *   • 14 hrs   → (12, 24]  → `24hr`
 *   • 28 hrs   → (24, 36]  → `36hr`
 *   • 50 hrs   → (48, 60]  → `60hr`
 *   • 24.0 hrs → (12, 24]  → `24hr` (exact boundary picks the SMALLER tier)
 *   • 24.1 hrs → (24, 36]  → `36hr` (one second past 24 moves up)
 *   • 12.01 hrs → (12, 24] → `24hr`
 *   • Custom range packages win when their `(min, max]` is tighter than the
 *     overlapping standard tier.
 *   • Synthetic 24hr×N day fallback kicks in only when no explicit standard
 *     range covers the requested duration.
 */

import { describe, it, expect } from 'vitest';
import { coveringTier, STANDARD_RANGES, type CustomPackage } from '../pricing';
import type { PackageTier } from '../supabase/types';

const ALL_TIERS: PackageTier[] = [
  '12hr', '24hr', '36hr', '2day', '60hr', '3day', '96hr', '120hr', '144hr', '7day',
];

function custom(overrides: Partial<CustomPackage> & Pick<CustomPackage, 'min_duration_hours' | 'duration_hours' | 'price' | 'km_limit' | 'label'>): CustomPackage {
  return {
    id: 'cp-' + overrides.label.replace(/\s+/g, '_').toLowerCase(),
    bike_id: 'bike-1',
    is_active: true,
    ...overrides,
  };
}

describe('coveringTier — user-facing range buckets', () => {
  it('14 hrs → 24hr tier (12–24 hr bracket)', () => {
    const r = coveringTier(14, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') {
      expect(r.tier).toBe('24hr');
      expect(r.actualDays).toBeUndefined();
    }
  });

  it('28 hrs → 36hr tier (24–36 hr bracket)', () => {
    const r = coveringTier(28, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('36hr');
  });

  it('40 hrs → 2day tier (36–48 hr bracket)', () => {
    const r = coveringTier(40, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('2day');
  });

  it('50 hrs → 60hr tier (48–60 hr bracket)', () => {
    const r = coveringTier(50, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('60hr');
  });

  it('66 hrs → 3day tier (60–72 hr bracket)', () => {
    const r = coveringTier(66, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('3day');
  });
});

describe('coveringTier — exact-boundary durations pick the smaller bracket', () => {
  it('exactly 12 → 12hr', () => {
    const r = coveringTier(12, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('12hr');
  });

  it('exactly 24 → 24hr', () => {
    const r = coveringTier(24, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('24hr');
  });

  it('exactly 36 → 36hr', () => {
    const r = coveringTier(36, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('36hr');
  });

  it('exactly 48 → 2day (preferred over 48hr at the same bound)', () => {
    const r = coveringTier(48, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('2day');
  });

  it('exactly 60 → 60hr', () => {
    const r = coveringTier(60, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('60hr');
  });

  it('exactly 72 → 3day', () => {
    const r = coveringTier(72, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('3day');
  });
});

describe('coveringTier — partial hours fall into the next bracket up', () => {
  it('12.01 hrs → 24hr (one second past 12 still in 12–24 bracket)', () => {
    const r = coveringTier(12.01, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('24hr');
  });

  it('24.5 hrs → 36hr', () => {
    const r = coveringTier(24.5, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('36hr');
  });

  it('47.99 hrs → 2day (just under the 48-hr upper bound)', () => {
    const r = coveringTier(47.99, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('2day');
  });
});

describe('coveringTier — missing brackets', () => {
  it('falls back to synthetic 24hr × 2 when 36hr / 2day are missing', () => {
    // Strict semantics: `2day` is (36, 48] so 28 hrs does NOT fall into it.
    // The 24hr × N-day synthetic fills (24, 48] and wins.
    const tiers: PackageTier[] = ['12hr', '24hr', '2day', '7day'];
    const r = coveringTier(28, tiers);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') {
      expect(r.tier).toBe('24hr');
      expect(r.actualDays).toBe(2);
    }
  });

  it('returns null when duration exceeds all configured brackets', () => {
    // Only the short tiers configured; 200 hrs overshoots everything.
    const tiers: PackageTier[] = ['12hr', '24hr'];
    expect(coveringTier(200, tiers)).toBeNull();
  });

  it('returns null for zero or negative durations', () => {
    expect(coveringTier(0, ALL_TIERS)).toBeNull();
    expect(coveringTier(-5, ALL_TIERS)).toBeNull();
  });
});

describe('STANDARD_RANGES — explicit (min, max] table', () => {
  it('every standard range has min < max', () => {
    for (const r of STANDARD_RANGES) {
      expect(r.min).toBeLessThan(r.max);
    }
  });

  it('the 12-24 / 24-36 boundary cases match the spec verbatim', () => {
    // 24.0 in (12, 24]  → 24hr
    const a = coveringTier(24.0, ALL_TIERS);
    expect(a?.type).toBe('standard');
    if (a?.type === 'standard') expect(a.tier).toBe('24hr');

    // 24.1 in (24, 36]  → 36hr
    const b = coveringTier(24.1, ALL_TIERS);
    expect(b?.type).toBe('standard');
    if (b?.type === 'standard') expect(b.tier).toBe('36hr');
  });

  it('rejects values that are at the strict lower bound of a range', () => {
    // 12.0 is the EXCLUSIVE lower bound of the 24hr range (12, 24] —
    // it must fall into the 12hr range (0, 12], not the 24hr one.
    const r = coveringTier(12.0, ALL_TIERS);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('12hr');
  });
});

describe('coveringTier — custom packages override standard tiers', () => {
  it('a custom range with a TIGHTER upper bound wins over a longer standard tier', () => {
    // Custom max=20 beats the next standard tier above 12 (which is 24hr).
    const cp = custom({ label: 'Weekend Special', min_duration_hours: 12, duration_hours: 20, price: 999, km_limit: 200 });
    const r = coveringTier(18, ALL_TIERS, [cp]);
    expect(r?.type).toBe('custom');
    if (r?.type === 'custom') expect(r.pkg.label).toBe('Weekend Special');
  });

  it('an inactive custom package is ignored', () => {
    const cp = custom({ label: 'Disabled Deal', min_duration_hours: 12, duration_hours: 20, price: 1, km_limit: 50, is_active: false });
    const r = coveringTier(18, ALL_TIERS, [cp]);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('24hr');
  });

  it('a custom range that does not include the duration is skipped', () => {
    // Custom range covers 48-72 hrs; a 30 hr booking should still land in the standard 36hr tier
    const cp = custom({ label: 'Long Weekend', min_duration_hours: 48, duration_hours: 72, price: 5000, km_limit: 400 });
    const r = coveringTier(30, ALL_TIERS, [cp]);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') expect(r.tier).toBe('36hr');
  });
});

describe('coveringTier — synthetic per-day fallback for 2-6 days', () => {
  it('48 hrs with no 2day/48hr/60hr tier falls back to 24hr × 2', () => {
    // Bike only has 12hr, 24hr, 7day — synthetic 24hr × N fills the gap
    const tiers: PackageTier[] = ['12hr', '24hr', '7day'];
    const r = coveringTier(48, tiers);
    expect(r?.type).toBe('standard');
    if (r?.type === 'standard') {
      expect(r.tier).toBe('24hr');
      expect(r.actualDays).toBe(2);
    }
  });
});
