/**
 * Tests for canonical booking-overlap detection.
 *
 * Covers the false-positive failure modes the production system was hitting:
 *   - completed rides leaking through as conflicts
 *   - cancelled bookings leaking through as conflicts
 *   - back-to-back slots being falsely rejected
 *   - expired pending_payment reservations still blocking
 *
 * All dates are constructed in IST so the suite is timezone-agnostic.
 */

import { describe, it, expect } from 'vitest';
import {
  intervalsOverlap,
  isBlockingBooking,
  findConflictingBooking,
  hasConflict,
  PENDING_PAYMENT_TTL_MIN,
  type BookingLike,
} from '../booking-overlap';

/** Wall-clock IST → UTC Date. IST is UTC+5:30. */
function ist(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000);
}

function booking(overrides: Partial<BookingLike> & Pick<BookingLike, 'status' | 'start_ts' | 'end_ts'>): BookingLike {
  return {
    id: 'b1',
    booking_number: 'ZD-TEST-1',
    created_at: ist(2026, 5, 11, 10, 0).toISOString(),
    ...overrides,
  };
}

describe('intervalsOverlap', () => {
  it('detects classic overlap', () => {
    expect(
      intervalsOverlap(
        ist(2026, 5, 11, 10), ist(2026, 5, 11, 14),
        ist(2026, 5, 11, 12), ist(2026, 5, 11, 16),
      ),
    ).toBe(true);
  });

  it('returns false for back-to-back slots (new starts exactly when existing ends)', () => {
    expect(
      intervalsOverlap(
        ist(2026, 5, 11, 14), ist(2026, 5, 11, 18),
        ist(2026, 5, 11, 10), ist(2026, 5, 11, 14),
      ),
    ).toBe(false);
  });

  it('returns false for back-to-back slots (existing starts exactly when new ends)', () => {
    expect(
      intervalsOverlap(
        ist(2026, 5, 11, 10), ist(2026, 5, 11, 14),
        ist(2026, 5, 11, 14), ist(2026, 5, 11, 18),
      ),
    ).toBe(false);
  });

  it('returns false for fully disjoint slots', () => {
    expect(
      intervalsOverlap(
        ist(2026, 5, 11, 6), ist(2026, 5, 11, 8),
        ist(2026, 5, 11, 14), ist(2026, 5, 11, 18),
      ),
    ).toBe(false);
  });

  it('detects a fully contained slot', () => {
    expect(
      intervalsOverlap(
        ist(2026, 5, 11, 12), ist(2026, 5, 11, 13),
        ist(2026, 5, 11, 10), ist(2026, 5, 11, 20),
      ),
    ).toBe(true);
  });
});

describe('isBlockingBooking', () => {
  const now = ist(2026, 5, 11, 12, 0);

  it('confirmed always blocks', () => {
    expect(isBlockingBooking(booking({ status: 'confirmed', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }), now)).toBe(true);
  });

  it('ongoing always blocks', () => {
    expect(isBlockingBooking(booking({ status: 'ongoing', start_ts: ist(2026,5,11,10), end_ts: ist(2026,5,11,14) }), now)).toBe(true);
  });

  it('completed never blocks', () => {
    expect(isBlockingBooking(booking({ status: 'completed', start_ts: ist(2026,5,11,8), end_ts: ist(2026,5,11,11) }), now)).toBe(false);
  });

  it('cancelled never blocks', () => {
    expect(isBlockingBooking(booking({ status: 'cancelled', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }), now)).toBe(false);
  });

  it('payment_failed never blocks', () => {
    expect(isBlockingBooking(booking({ status: 'payment_failed', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }), now)).toBe(false);
  });

  it('no_show never blocks', () => {
    expect(isBlockingBooking(booking({ status: 'no_show', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }), now)).toBe(false);
  });

  it('pending_payment blocks while within TTL window', () => {
    const freshCreated = new Date(now.getTime() - (PENDING_PAYMENT_TTL_MIN - 1) * 60_000).toISOString();
    expect(
      isBlockingBooking(
        booking({ status: 'pending_payment', created_at: freshCreated, start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }),
        now,
      ),
    ).toBe(true);
  });

  it('pending_payment stops blocking once TTL has elapsed', () => {
    const staleCreated = new Date(now.getTime() - (PENDING_PAYMENT_TTL_MIN + 5) * 60_000).toISOString();
    expect(
      isBlockingBooking(
        booking({ status: 'pending_payment', created_at: staleCreated, start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }),
        now,
      ),
    ).toBe(false);
  });
});

describe('findConflictingBooking', () => {
  const now = ist(2026, 5, 11, 12, 0);
  const newPickup = ist(2026, 5, 11, 14);
  const newDrop   = ist(2026, 5, 11, 18);

  it('returns null when the bike has no bookings at all', () => {
    expect(findConflictingBooking(newPickup, newDrop, [], { now })).toBeNull();
  });

  it('reports a conflict for a confirmed overlapping booking', () => {
    const c = booking({ id: 'b-confirmed', status: 'confirmed', start_ts: ist(2026,5,11,16), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })?.id).toBe('b-confirmed');
  });

  it('reports a conflict for an ongoing booking that hasn\'t been returned yet', () => {
    const o = booking({ id: 'b-ongoing', status: 'ongoing', start_ts: ist(2026,5,11,10), end_ts: ist(2026,5,11,15) });
    expect(findConflictingBooking(newPickup, newDrop, [o], { now })?.id).toBe('b-ongoing');
  });

  it('ignores a CANCELLED booking that overlaps the requested window', () => {
    const c = booking({ id: 'b-cancelled', status: 'cancelled', start_ts: ist(2026,5,11,12), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('ignores a COMPLETED ride that overlaps the requested window', () => {
    const c = booking({ id: 'b-completed', status: 'completed', start_ts: ist(2026,5,11,12), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('ignores a NO_SHOW booking that overlaps the requested window', () => {
    const c = booking({ id: 'b-noshow', status: 'no_show', start_ts: ist(2026,5,11,12), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('allows BACK-TO-BACK bookings (existing ends exactly when new starts)', () => {
    const c = booking({ id: 'b-prev', status: 'confirmed', start_ts: ist(2026,5,11,10), end_ts: ist(2026,5,11,14) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('allows BACK-TO-BACK bookings (existing starts exactly when new ends)', () => {
    const c = booking({ id: 'b-next', status: 'confirmed', start_ts: ist(2026,5,11,18), end_ts: ist(2026,5,11,22) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('ignores a STALE pending_payment booking past its TTL', () => {
    const staleCreated = new Date(now.getTime() - (PENDING_PAYMENT_TTL_MIN + 10) * 60_000).toISOString();
    const c = booking({ id: 'b-stale', status: 'pending_payment', created_at: staleCreated, start_ts: ist(2026,5,11,16), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })).toBeNull();
  });

  it('still blocks for a FRESH pending_payment booking within TTL', () => {
    const freshCreated = new Date(now.getTime() - 5 * 60_000).toISOString();
    const c = booking({ id: 'b-fresh', status: 'pending_payment', created_at: freshCreated, start_ts: ist(2026,5,11,16), end_ts: ist(2026,5,11,20) });
    expect(findConflictingBooking(newPickup, newDrop, [c], { now })?.id).toBe('b-fresh');
  });

  it('excludes self when updating an existing booking', () => {
    const self = booking({ id: 'b-self', status: 'confirmed', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) });
    expect(
      findConflictingBooking(newPickup, newDrop, [self], { now, excludeId: 'b-self' }),
    ).toBeNull();
  });

  it('finds the first conflict among a mixed list', () => {
    const list: BookingLike[] = [
      booking({ id: 'b-completed', status: 'completed',   start_ts: ist(2026,5,11,12), end_ts: ist(2026,5,11,15) }),
      booking({ id: 'b-cancelled', status: 'cancelled',   start_ts: ist(2026,5,11,13), end_ts: ist(2026,5,11,19) }),
      booking({ id: 'b-real',      status: 'confirmed',   start_ts: ist(2026,5,11,16), end_ts: ist(2026,5,11,20) }),
      booking({ id: 'b-other',     status: 'confirmed',   start_ts: ist(2026,5,11,15), end_ts: ist(2026,5,11,17) }),
    ];
    expect(findConflictingBooking(newPickup, newDrop, list, { now })?.id).toBe('b-real');
  });
});

describe('hasConflict', () => {
  const now = ist(2026, 5, 11, 12, 0);

  it('agrees with findConflictingBooking', () => {
    const list: BookingLike[] = [
      booking({ id: 'b-completed', status: 'completed', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }),
    ];
    expect(hasConflict(ist(2026,5,11,14), ist(2026,5,11,18), list, { now })).toBe(false);

    list.push(booking({ id: 'b-confirmed', status: 'confirmed', start_ts: ist(2026,5,11,14), end_ts: ist(2026,5,11,18) }));
    expect(hasConflict(ist(2026,5,11,14), ist(2026,5,11,18), list, { now })).toBe(true);
  });
});
