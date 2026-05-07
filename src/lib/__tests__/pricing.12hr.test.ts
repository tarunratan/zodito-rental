/**
 * Tests for the 12-hour rental slot logic.
 *
 * All dates are created in IST (UTC+5:30) so these tests are timezone-agnostic
 * and pass in any environment (UTC, IST, etc.).
 */

import { describe, it, expect } from 'vitest';
import {
  calculate12HourSlot,
  twelveHrReturn,
  tierEndTs,
  coveringTier,
} from '../pricing';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a UTC Date from IST wall-clock components (IST = UTC+5:30). */
function ist(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000);
}

/** Extract IST wall-clock hour from any Date. */
function istHour(d: Date): number {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
}

/** Extract IST calendar date (YYYY-MM-DD). */
function istDate(d: Date): string {
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Zone 1: Morning pickups 6 AM – 10 AM → drop = pickup + 12 hrs ────────────

describe('Zone 1 — Morning (6 AM–10 AM): drop = pickup + 12 hrs', () => {
  const cases: [number, number][] = [
    [6, 18],  // 6 AM → 6 PM
    [7, 19],  // 7 AM → 7 PM
    [8, 20],  // 8 AM → 8 PM
    [9, 21],  // 9 AM → 9 PM
    [10, 22], // 10 AM → 10 PM
  ];

  for (const [pickupHour, dropHour] of cases) {
    it(`${pickupHour} AM → ${dropHour > 12 ? dropHour - 12 : dropHour} ${dropHour >= 12 ? 'PM' : 'AM'}`, () => {
      const pickup = ist(2024, 1, 15, pickupHour);
      const slot = calculate12HourSlot(pickup);

      expect(slot.zone).toBe('morning');
      expect(slot.durationHours).toBe(12);
      expect(istHour(slot.dropTime)).toBe(dropHour);
      expect(istDate(slot.dropTime)).toBe('2024-01-15'); // same day
    });
  }
});

// ── Zone 2: Midday pickups 11 AM – 5 PM → drop = 10 PM same day ─────────────

describe('Zone 2 — Midday (11 AM–5 PM): drop = same day 10 PM IST', () => {
  const cases: [number, number, number][] = [
    [11, 0,  11],       // 11 AM → 11 hrs
    [12, 0,  10],       // 12 PM → 10 hrs
    [13, 0,  9],        // 1 PM  → 9 hrs
    [14, 0,  8],        // 2 PM  → 8 hrs
    [15, 0,  7],        // 3 PM  → 7 hrs
    [16, 0,  6],        // 4 PM  → 6 hrs
    [17, 0,  5],        // 5 PM  → 5 hrs
  ];

  for (const [pickupHour, , expectedDuration] of cases) {
    it(`${pickupHour > 12 ? pickupHour - 12 : pickupHour} ${pickupHour >= 12 ? 'PM' : 'AM'} → 10 PM (${expectedDuration} hrs)`, () => {
      const pickup = ist(2024, 1, 15, pickupHour);
      const slot = calculate12HourSlot(pickup);

      expect(slot.zone).toBe('midday');
      expect(istHour(slot.dropTime)).toBe(22); // 10 PM
      expect(istDate(slot.dropTime)).toBe('2024-01-15'); // same day
      expect(slot.durationHours).toBeCloseTo(expectedDuration, 1);
    });
  }

  it('5:30 PM (with minutes) → 10 PM same day, 4.5 hrs', () => {
    const pickup = ist(2024, 1, 15, 17, 30);
    const slot = calculate12HourSlot(pickup);

    expect(slot.zone).toBe('midday');
    expect(istHour(slot.dropTime)).toBe(22);
    expect(istDate(slot.dropTime)).toBe('2024-01-15');
    expect(slot.durationHours).toBeCloseTo(4.5, 1);
  });
});

// ── Zone 3: Evening pickups 6 PM – 10 PM → drop = pickup + 12 hrs ────────────

describe('Zone 3 — Evening (6 PM–10 PM): drop = pickup + 12 hrs (next morning)', () => {
  const cases: [number, number][] = [
    [18, 6],  // 6 PM → 6 AM next day
    [19, 7],  // 7 PM → 7 AM next day
    [20, 8],  // 8 PM → 8 AM next day
    [21, 9],  // 9 PM → 9 AM next day
    [22, 10], // 10 PM → 10 AM next day
  ];

  for (const [pickupHour, dropHour] of cases) {
    it(`${pickupHour - 12} PM → ${dropHour} AM next day`, () => {
      const pickup = ist(2024, 1, 15, pickupHour);
      const slot = calculate12HourSlot(pickup);

      expect(slot.zone).toBe('evening');
      expect(slot.durationHours).toBe(12);
      expect(istHour(slot.dropTime)).toBe(dropHour);
      expect(istDate(slot.dropTime)).toBe('2024-01-16'); // next day
    });
  }
});

// ── Zone boundary exactness ───────────────────────────────────────────────────

describe('Zone boundaries', () => {
  it('10 AM (last morning hour) → 10 PM same day via +12 hrs', () => {
    const pickup = ist(2024, 1, 15, 10);
    const slot = calculate12HourSlot(pickup);
    expect(slot.zone).toBe('morning');
    expect(istHour(slot.dropTime)).toBe(22);
    expect(istDate(slot.dropTime)).toBe('2024-01-15');
    expect(slot.durationHours).toBe(12);
  });

  it('11 AM (first midday hour) → 10 PM fixed (not +12 = 11 PM)', () => {
    const pickup = ist(2024, 1, 15, 11);
    const slot = calculate12HourSlot(pickup);
    expect(slot.zone).toBe('midday');
    expect(istHour(slot.dropTime)).toBe(22);
    expect(istDate(slot.dropTime)).toBe('2024-01-15');
    expect(slot.durationHours).toBe(11); // 11 hrs not 12
  });

  it('5 PM (17:00, last full midday hour) → 10 PM same day', () => {
    const pickup = ist(2024, 1, 15, 17);
    const slot = calculate12HourSlot(pickup);
    expect(slot.zone).toBe('midday');
    expect(istHour(slot.dropTime)).toBe(22);
    expect(istDate(slot.dropTime)).toBe('2024-01-15');
  });

  it('6 PM (18:00, first evening hour) → 6 AM next day', () => {
    const pickup = ist(2024, 1, 15, 18);
    const slot = calculate12HourSlot(pickup);
    expect(slot.zone).toBe('evening');
    expect(istHour(slot.dropTime)).toBe(6);
    expect(istDate(slot.dropTime)).toBe('2024-01-16');
    expect(slot.durationHours).toBe(12);
  });
});

// ── Cross-calendar-day scenarios ─────────────────────────────────────────────

describe('Cross-day and month-end edge cases', () => {
  it('10 PM on Dec 31 → 10 AM on Jan 1 next year', () => {
    const pickup = ist(2024, 12, 31, 22);
    const slot = calculate12HourSlot(pickup);
    expect(istHour(slot.dropTime)).toBe(10);
    expect(istDate(slot.dropTime)).toBe('2025-01-01');
  });

  it('10 PM on Jan 31 → 10 AM on Feb 1', () => {
    const pickup = ist(2024, 1, 31, 22);
    const slot = calculate12HourSlot(pickup);
    expect(istHour(slot.dropTime)).toBe(10);
    expect(istDate(slot.dropTime)).toBe('2024-02-01');
  });

  it('9 PM on Feb 28 (non-leap) → 9 AM on Mar 1', () => {
    const pickup = ist(2023, 2, 28, 21);
    const slot = calculate12HourSlot(pickup);
    expect(istHour(slot.dropTime)).toBe(9);
    expect(istDate(slot.dropTime)).toBe('2023-03-01');
  });

  it('9 PM on Feb 29 (leap year) → 9 AM on Mar 1', () => {
    const pickup = ist(2024, 2, 29, 21);
    const slot = calculate12HourSlot(pickup);
    expect(istHour(slot.dropTime)).toBe(9);
    expect(istDate(slot.dropTime)).toBe('2024-03-01');
  });
});

// ── twelveHrReturn wrapper ───────────────────────────────────────────────────

describe('twelveHrReturn()', () => {
  it('returns the same Date as calculate12HourSlot().dropTime', () => {
    const pickup = ist(2024, 6, 15, 14); // 2 PM IST — midday
    expect(twelveHrReturn(pickup).getTime()).toBe(calculate12HourSlot(pickup).dropTime.getTime());
  });

  it('Zone 1: 7 AM → 7 PM same day', () => {
    const pickup = ist(2024, 6, 15, 7);
    const drop = twelveHrReturn(pickup);
    expect(istHour(drop)).toBe(19);
    expect(istDate(drop)).toBe('2024-06-15');
  });

  it('Zone 2: 3 PM → 10 PM same day', () => {
    const pickup = ist(2024, 6, 15, 15);
    const drop = twelveHrReturn(pickup);
    expect(istHour(drop)).toBe(22);
    expect(istDate(drop)).toBe('2024-06-15');
  });

  it('Zone 3: 8 PM → 8 AM next day', () => {
    const pickup = ist(2024, 6, 15, 20);
    const drop = twelveHrReturn(pickup);
    expect(istHour(drop)).toBe(8);
    expect(istDate(drop)).toBe('2024-06-16');
  });
});

// ── tierEndTs delegates to calculate12HourSlot for '12hr' ───────────────────

describe('tierEndTs() for 12hr tier', () => {
  it('delegates to calculate12HourSlot — Zone 1', () => {
    const pickup = ist(2024, 3, 10, 9); // 9 AM
    const end = tierEndTs(pickup, '12hr');
    expect(end.getTime()).toBe(calculate12HourSlot(pickup).dropTime.getTime());
    expect(istHour(end)).toBe(21); // 9 PM
  });

  it('delegates to calculate12HourSlot — Zone 2', () => {
    const pickup = ist(2024, 3, 10, 13); // 1 PM
    const end = tierEndTs(pickup, '12hr');
    expect(end.getTime()).toBe(calculate12HourSlot(pickup).dropTime.getTime());
    expect(istHour(end)).toBe(22); // 10 PM
  });

  it('delegates to calculate12HourSlot — Zone 3', () => {
    const pickup = ist(2024, 3, 10, 20); // 8 PM
    const end = tierEndTs(pickup, '12hr');
    expect(end.getTime()).toBe(calculate12HourSlot(pickup).dropTime.getTime());
    expect(istHour(end)).toBe(8); // 8 AM next day
  });

  it('ignores actual_days for 12hr tier', () => {
    const pickup = ist(2024, 3, 10, 9);
    // actual_days=2 would double the price in calculatePrice but tierEndTs must ignore it
    const endWith  = tierEndTs(pickup, '12hr', 2);
    const endWithout = tierEndTs(pickup, '12hr');
    expect(endWith.getTime()).toBe(endWithout.getTime());
  });
});

// ── coveringTier correctly prices midday (< 12 hr actual) slots ──────────────

describe('coveringTier() maps all 12hr slots to the 12hr tier', () => {
  const tiers = ['12hr', '24hr'] as const;

  it('Zone 1 — 9 hrs ≤ 12 → 12hr tier', () => {
    const result = coveringTier(9, [...tiers]);
    expect(result?.type).toBe('standard');
    if (result?.type === 'standard') expect(result.tier).toBe('12hr');
  });

  it('Zone 2 — 9 hrs (1 PM→10 PM) → 12hr tier', () => {
    const result = coveringTier(9, [...tiers]);
    expect(result?.type).toBe('standard');
    if (result?.type === 'standard') expect(result.tier).toBe('12hr');
  });

  it('Zone 2 — 11 hrs (11 AM→10 PM) → 12hr tier', () => {
    const result = coveringTier(11, [...tiers]);
    expect(result?.type).toBe('standard');
    if (result?.type === 'standard') expect(result.tier).toBe('12hr');
  });

  it('Zone 1 — exactly 12 hrs → 12hr tier', () => {
    const result = coveringTier(12, [...tiers]);
    expect(result?.type).toBe('standard');
    if (result?.type === 'standard') expect(result.tier).toBe('12hr');
  });

  it('13 hrs → 24hr tier (no 12hr for longer bookings)', () => {
    const result = coveringTier(13, [...tiers]);
    expect(result?.type).toBe('standard');
    if (result?.type === 'standard') expect(result.tier).toBe('24hr');
  });
});

// ── 24hr and multi-day tiers are unaffected ──────────────────────────────────

describe('24hr and multi-day tiers — unaffected by 12hr changes', () => {
  it('24hr tier adds exactly 24 hours', () => {
    const pickup = ist(2024, 1, 15, 10);
    const end = tierEndTs(pickup, '24hr');
    expect(end.getTime() - pickup.getTime()).toBe(24 * 3_600_000);
  });

  it('2day tier adds exactly 48 hours', () => {
    const pickup = ist(2024, 1, 15, 10);
    const end = tierEndTs(pickup, '2day');
    expect(end.getTime() - pickup.getTime()).toBe(48 * 3_600_000);
  });

  it('7day tier adds exactly 168 hours', () => {
    const pickup = ist(2024, 1, 15, 10);
    const end = tierEndTs(pickup, '7day');
    expect(end.getTime() - pickup.getTime()).toBe(168 * 3_600_000);
  });

  it('24hr with actualDays=3 adds exactly 72 hours', () => {
    const pickup = ist(2024, 1, 15, 10);
    const end = tierEndTs(pickup, '24hr', 3);
    expect(end.getTime() - pickup.getTime()).toBe(72 * 3_600_000);
  });
});

// ── All 12hr examples from the spec ──────────────────────────────────────────

describe('Spec examples verbatim', () => {
  // Rule 1: Pickup 6 AM–10 AM → pickup + 12 hrs
  it('Spec R1: 6 AM → 6 PM', () => {
    expect(istHour(twelveHrReturn(ist(2024, 1, 1, 6)))).toBe(18);
  });
  it('Spec R1: 7 AM → 7 PM', () => {
    expect(istHour(twelveHrReturn(ist(2024, 1, 1, 7)))).toBe(19);
  });
  it('Spec R1: 10 AM → 10 PM', () => {
    expect(istHour(twelveHrReturn(ist(2024, 1, 1, 10)))).toBe(22);
  });

  // Rule 2: Pickup 11 AM–5:59 PM → same day 10 PM
  it('Spec R2: 1 PM → 10 PM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 13));
    expect(istHour(d)).toBe(22);
    expect(istDate(d)).toBe('2024-01-01');
  });
  it('Spec R2: 4 PM → 10 PM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 16));
    expect(istHour(d)).toBe(22);
    expect(istDate(d)).toBe('2024-01-01');
  });
  it('Spec R2: 5:59 PM → 10 PM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 17, 59));
    expect(istHour(d)).toBe(22);
    expect(istDate(d)).toBe('2024-01-01');
  });

  // Rule 3: Pickup 6 PM–10 PM → pickup + 12 hrs
  it('Spec R3: 6 PM → next day 6 AM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 18));
    expect(istHour(d)).toBe(6);
    expect(istDate(d)).toBe('2024-01-02');
  });
  it('Spec R3: 7 PM → next day 7 AM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 19));
    expect(istHour(d)).toBe(7);
    expect(istDate(d)).toBe('2024-01-02');
  });
  it('Spec R3: 9 PM → next day 9 AM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 21));
    expect(istHour(d)).toBe(9);
    expect(istDate(d)).toBe('2024-01-02');
  });
  it('Spec R3: 10 PM → next day 10 AM', () => {
    const d = twelveHrReturn(ist(2024, 1, 1, 22));
    expect(istHour(d)).toBe(10);
    expect(istDate(d)).toBe('2024-01-02');
  });
});
