/**
 * Bike freeze (maintenance) semantics — single source of truth.
 *
 * A bike row carries an optional time window:
 *   - `frozen_from`  (nullable) — when the freeze starts. NULL means "from
 *                                  the beginning of time", i.e. already in
 *                                  effect when the row was written.
 *   - `frozen_until` (nullable) — when the freeze ends. NULL means "not
 *                                  frozen".
 *
 * The bike is unavailable during any time range [from, to] that OVERLAPS
 * the freeze window. The historical implementations required BOTH columns
 * to be non-null before checking — that meant admins who skipped the
 * "from" field accidentally produced rows that the customer-facing APIs
 * silently ignored, letting frozen bikes stay bookable. This helper
 * centralizes the correct check so every callsite uses identical logic.
 */

export interface FreezableBike {
  frozen_from:  string | null;
  frozen_until: string | null;
}

/**
 * Returns true iff `bike` is frozen during the window [from, to]. NULL
 * `frozen_from` is treated as -infinity. The bike is considered frozen
 * whenever its freeze window overlaps the requested window (standard
 * half-open overlap predicate).
 */
export function isFrozenInWindow(
  bike: FreezableBike | null | undefined,
  from: Date,
  to:   Date,
): boolean {
  if (!bike?.frozen_until) return false;
  const fu = new Date(bike.frozen_until);
  if (fu <= from) return false;                 // freeze ends before window starts
  if (!bike.frozen_from) return true;           // freeze runs from -inf — overlaps
  const ff = new Date(bike.frozen_from);
  return ff < fu;                                // freeze starts before window ends
}

/** Convenience for the common "is this bike frozen right now" check. */
export function isFrozenNow(bike: FreezableBike | null | undefined, now: Date = new Date()): boolean {
  // Window is a degenerate single point — use a tiny epsilon window so the
  // overlap predicate still works.
  return isFrozenInWindow(bike, now, new Date(now.getTime() + 1));
}
