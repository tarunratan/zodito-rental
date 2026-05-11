/**
 * Canonical booking-overlap detection.
 *
 * Single source of truth for "does booking X conflict with bookings Y[]?".
 * Used by manual booking creation, availability checks, and unit tests.
 *
 * Overlap rule (half-open intervals, `[start, end)`):
 *     newPickup < existingDrop  AND  newDrop > existingPickup
 *
 * Back-to-back bookings (newPickup === existingDrop) do NOT overlap.
 *
 * Status filter:
 *   - `confirmed` / `ongoing`            → ALWAYS block
 *   - `pending_payment`                  → block ONLY if created within the
 *                                          payment-deadline window (default 15 min);
 *                                          older ones are stale and ignored.
 *   - `completed`, `cancelled`,
 *     `payment_failed`, `no_show`        → NEVER block
 */

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'ongoing'
  | 'completed'
  | 'cancelled'
  | 'payment_failed'
  | 'no_show';

export interface BookingLike {
  id?: string;
  booking_number?: string | null;
  status: BookingStatus | string;
  start_ts: string | Date;
  end_ts: string | Date;
  /** ISO string or Date. Used to expire stale pending_payment rows. */
  created_at?: string | Date | null;
}

/** Statuses that always reserve the bike, regardless of recency. */
export const ALWAYS_BLOCKING: ReadonlySet<string> = new Set(['confirmed', 'ongoing']);

/** Statuses that block only while their payment-deadline window is still open. */
export const RECENCY_BLOCKING: ReadonlySet<string> = new Set(['pending_payment']);

/** Statuses that NEVER block a new booking. */
export const NON_BLOCKING: ReadonlySet<string> = new Set([
  'completed',
  'cancelled',
  'payment_failed',
  'no_show',
]);

/** How long an unpaid `pending_payment` reservation holds the slot, in minutes. */
export const PENDING_PAYMENT_TTL_MIN = 15;

function toMs(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/**
 * Pure half-open interval overlap.
 * Back-to-back (a's end equals b's start) returns false.
 */
export function intervalsOverlap(
  aStart: string | Date,
  aEnd:   string | Date,
  bStart: string | Date,
  bEnd:   string | Date,
): boolean {
  return toMs(aStart) < toMs(bEnd) && toMs(aEnd) > toMs(bStart);
}

/**
 * Should this existing booking block a new booking, ignoring time-window?
 * Encodes the status-state-machine rules: only active or recently-pending
 * bookings hold a slot.
 */
export function isBlockingBooking(
  b: BookingLike,
  now: Date = new Date(),
  pendingTtlMin: number = PENDING_PAYMENT_TTL_MIN,
): boolean {
  const status = String(b.status);
  if (NON_BLOCKING.has(status)) return false;
  if (ALWAYS_BLOCKING.has(status)) return true;
  if (RECENCY_BLOCKING.has(status)) {
    if (!b.created_at) return true; // unknown age → conservatively block
    const ageMs = now.getTime() - toMs(b.created_at);
    return ageMs <= pendingTtlMin * 60 * 1000;
  }
  return false; // unknown status → safe default: do not block
}

/**
 * Find the first conflicting booking, or null if the requested window is free.
 * Order of the input list matters only for which conflict is reported first.
 */
export function findConflictingBooking(
  newPickup: string | Date,
  newDrop:   string | Date,
  existing:  ReadonlyArray<BookingLike>,
  opts:      { now?: Date; excludeId?: string; pendingTtlMin?: number } = {},
): BookingLike | null {
  const now = opts.now ?? new Date();
  const ttl = opts.pendingTtlMin ?? PENDING_PAYMENT_TTL_MIN;

  for (const b of existing) {
    if (opts.excludeId && b.id === opts.excludeId) continue; // ignore self when updating
    if (!isBlockingBooking(b, now, ttl)) continue;
    if (intervalsOverlap(newPickup, newDrop, b.start_ts, b.end_ts)) return b;
  }
  return null;
}

/**
 * Boolean shortcut for `findConflictingBooking(...) !== null`.
 */
export function hasConflict(
  newPickup: string | Date,
  newDrop:   string | Date,
  existing:  ReadonlyArray<BookingLike>,
  opts?:     { now?: Date; excludeId?: string; pendingTtlMin?: number },
): boolean {
  return findConflictingBooking(newPickup, newDrop, existing, opts) !== null;
}
