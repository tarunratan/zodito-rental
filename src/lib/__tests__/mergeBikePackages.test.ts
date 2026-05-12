/**
 * Tests for `mergeBikePackages` — the helper that combines model-level
 * defaults with per-bike admin overrides.
 *
 * Pins the bug fix from the original report:
 *
 *   "First 2 tiers' admin updates propagate, tiers 3+ don't."
 *
 * Root cause was a left-join over model rows (`modelPackages.map(...)`)
 * which silently dropped overrides for any tier the seeded model never
 * had a row for. The historical DB seed (003_master_pricing.sql) only
 * inserts `12hr / 24hr / 7day / 15day / 30day` per model — so admin
 * edits to `36hr`, `2day`, `60hr`, `3day` etc. were always invisible
 * to the customer.
 *
 * `mergeBikePackages` returns the UNION of both sources, with overrides
 * winning on conflict. The tests below lock that contract.
 */

import { describe, it, expect } from 'vitest';
import { mergeBikePackages } from '../pricing';

describe('mergeBikePackages — union semantics', () => {
  it('returns model-only tiers when there are no overrides', () => {
    const model = [
      { tier: '12hr' as const, price: 300, km_limit: 100 },
      { tier: '24hr' as const, price: 500, km_limit: 140 },
    ];
    const merged = mergeBikePackages(model, []);
    expect(merged).toEqual([
      { tier: '12hr', price: 300, km_limit: 100 },
      { tier: '24hr', price: 500, km_limit: 140 },
    ]);
  });

  it('SURFACES admin overrides for tiers the model never seeded', () => {
    // Historical seed shape: only 12hr / 24hr at the model level
    const model = [
      { tier: '12hr' as const, price: 349, km_limit: 100 },
      { tier: '24hr' as const, price: 449, km_limit: 140 },
    ];
    // Admin saved an override for 36hr (which has NO model row)
    const overrides = [
      { tier: '36hr' as const, price: 850, km_limit: 240 },
    ];
    const merged = mergeBikePackages(model, overrides);
    // The 36hr override MUST appear in the merged list — the old buggy
    // implementation silently dropped it.
    expect(merged).toContainEqual({ tier: '36hr', price: 850, km_limit: 240 });
    expect(merged).toContainEqual({ tier: '12hr', price: 349, km_limit: 100 });
    expect(merged).toContainEqual({ tier: '24hr', price: 449, km_limit: 140 });
    expect(merged).toHaveLength(3);
  });

  it('overrides win when both sources have a row for the same tier', () => {
    const model = [{ tier: '24hr' as const, price: 449, km_limit: 140 }];
    const overrides = [{ tier: '24hr' as const, price: 599, km_limit: 160 }];
    const merged = mergeBikePackages(model, overrides);
    expect(merged).toEqual([{ tier: '24hr', price: 599, km_limit: 160 }]);
  });

  it('coerces string prices (from numeric Postgres columns) to numbers', () => {
    const model = [{ tier: '12hr' as const, price: '349.00' as any, km_limit: 100 }];
    const overrides = [{ tier: '36hr' as const, price: '850' as any, km_limit: 240 }];
    const merged = mergeBikePackages(model, overrides);
    expect(typeof merged[0].price).toBe('number');
    expect(merged[0].price).toBe(349);
    expect(typeof merged[1].price).toBe('number');
    expect(merged[1].price).toBe(850);
  });

  it('handles null/undefined inputs gracefully', () => {
    expect(mergeBikePackages(undefined as any, [])).toEqual([]);
    expect(mergeBikePackages([], undefined as any)).toEqual([]);
    expect(mergeBikePackages(null as any, null as any)).toEqual([]);
  });

  it('end-to-end shape: tier 3 / 4 admin edits reach customer', () => {
    // The bug: customer set 36hr=900, 2day=1100 in admin. Model only has 12hr, 24hr.
    // After merge, both new tiers must be present so coveringTier can pick them.
    const model = [
      { tier: '12hr' as const, price: 349, km_limit: 100 },
      { tier: '24hr' as const, price: 449, km_limit: 140 },
    ];
    const overrides = [
      { tier: '36hr' as const, price: 900,  km_limit: 240 },
      { tier: '2day' as const, price: 1100, km_limit: 280 },
    ];
    const merged = mergeBikePackages(model, overrides);
    const tiers = merged.map(p => p.tier).sort();
    expect(tiers).toEqual(['12hr', '24hr', '2day', '36hr'].sort());
  });
});
