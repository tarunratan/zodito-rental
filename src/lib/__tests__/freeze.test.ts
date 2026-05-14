/**
 * Tests for the freeze-window helper.
 *
 * Pins the contract:
 *   • `frozen_until` is the ONLY required column. NULL freeze_until = not frozen.
 *   • `frozen_from = NULL` is treated as -infinity — the historical bug where
 *     filters required BOTH columns let frozen bikes with no `from` value
 *     stay bookable.
 *   • Standard half-open overlap predicate against the query window.
 */

import { describe, it, expect } from 'vitest';
import { isFrozenInWindow, isFrozenNow } from '../freeze';

const T = (s: string) => new Date(s);

describe('isFrozenInWindow — overlap semantics', () => {
  it('not frozen when frozen_until is null', () => {
    expect(isFrozenInWindow({ frozen_from: null, frozen_until: null }, T('2026-05-15'), T('2026-05-16'))).toBe(false);
    expect(isFrozenInWindow({ frozen_from: '2026-01-01', frozen_until: null }, T('2026-05-15'), T('2026-05-16'))).toBe(false);
  });

  it('frozen when freeze window fully contains the query window', () => {
    expect(isFrozenInWindow(
      { frozen_from: '2026-05-10', frozen_until: '2026-05-20' },
      T('2026-05-15'), T('2026-05-16'),
    )).toBe(true);
  });

  it('frozen when query window starts inside the freeze and extends past it', () => {
    expect(isFrozenInWindow(
      { frozen_from: '2026-05-10', frozen_until: '2026-05-15T12:00' },
      T('2026-05-15'), T('2026-05-20'),
    )).toBe(true);
  });

  it('frozen when query window ends inside the freeze', () => {
    expect(isFrozenInWindow(
      { frozen_from: '2026-05-16', frozen_until: '2026-05-20' },
      T('2026-05-10'), T('2026-05-17'),
    )).toBe(true);
  });

  it('NOT frozen when freeze ends before the query window starts', () => {
    expect(isFrozenInWindow(
      { frozen_from: '2026-05-10', frozen_until: '2026-05-15' },
      T('2026-05-15T00:00:00.001'), T('2026-05-20'),
    )).toBe(false);
  });

  it('NOT frozen when freeze starts after the query window ends', () => {
    expect(isFrozenInWindow(
      { frozen_from: '2026-05-20', frozen_until: '2026-05-25' },
      T('2026-05-10'), T('2026-05-15'),
    )).toBe(false);
  });

  it('NULL frozen_from is treated as -infinity (historical bug fix)', () => {
    // The original filters required `frozen_from IS NOT NULL` AND `frozen_until
    // IS NOT NULL`, which silently let rows with only the upper bound set
    // bypass every freeze check. The helper must consider this row frozen.
    expect(isFrozenInWindow(
      { frozen_from: null, frozen_until: '2026-05-20' },
      T('2026-05-15'), T('2026-05-16'),
    )).toBe(true);
  });

  it('NULL frozen_from with freeze ending before window = not frozen', () => {
    expect(isFrozenInWindow(
      { frozen_from: null, frozen_until: '2026-05-10' },
      T('2026-05-15'), T('2026-05-16'),
    )).toBe(false);
  });
});

describe('isFrozenNow', () => {
  it('returns true when the freeze window covers right now', () => {
    const now = T('2026-05-15T12:00');
    expect(isFrozenNow(
      { frozen_from: '2026-05-15T00:00', frozen_until: '2026-05-15T23:00' },
      now,
    )).toBe(true);
  });

  it('returns false when the freeze has expired', () => {
    const now = T('2026-05-15T12:00');
    expect(isFrozenNow(
      { frozen_from: '2026-05-10', frozen_until: '2026-05-14T23:00' },
      now,
    )).toBe(false);
  });

  it('returns true for a NULL frozen_from row with future frozen_until', () => {
    const now = T('2026-05-15T12:00');
    expect(isFrozenNow(
      { frozen_from: null, frozen_until: '2026-05-20' },
      now,
    )).toBe(true);
  });
});
