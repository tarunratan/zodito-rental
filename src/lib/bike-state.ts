/**
 * Single entry point into the `bike_states` SQL function.
 *
 * Every customer-facing read that asks "is this bike (or these bikes)
 * available + what does it cost for this window?" should call one of
 * `getBikeState` / `getBikeStates`. The point is that ALL callers use
 * identical input data — no more "the home list and the detail page
 * disagree because they each merged packages differently."
 *
 * The function does NOT compute the final price. It returns:
 *   - availability + the discriminating reason
 *   - the visibility / freeze raw columns (for UI banners and diagnostics)
 *   - already-merged `packages` (model + override UNION)
 *   - active `custom_packages`
 *
 * Pricing math (`coveringTier` + `calculatePrice`) still lives in
 * `src/lib/pricing.ts` so we keep the existing test coverage. The point
 * is that pricing JS now receives canonical inputs.
 */

import { createSupabaseAdminFresh } from './supabase/server';
import type { CustomPackage } from './pricing';
import type { PackageTier } from './supabase/types';

export type BikeUnavailableReason =
  | 'inactive'
  | 'unapproved'
  | 'ongoing'
  | 'booked'
  | 'frozen'
  | 'not_found';

export interface BikeStateRow {
  bike_id: string;
  available: boolean;
  reason: BikeUnavailableReason | null;
  is_active: boolean;
  listing_status: string;
  is_frozen: boolean;            // v043 — authoritative freeze flag
  frozen_from: string | null;    // metadata only post-v043
  frozen_until: string | null;   // metadata only post-v043
  freeze_reason: string | null;
  packages: Array<{ tier: PackageTier; price: number; km_limit: number }>;
  custom_packages: CustomPackage[];
}

/**
 * Single-bike state lookup. Returns `null` when the bike id doesn't exist
 * (the SQL function returns no rows for a missing id; callers translate
 * that to `reason: 'not_found'` at the API boundary if they want to
 * surface it to the client).
 */
export async function getBikeState(
  bikeId: string,
  from: Date,
  to:   Date,
): Promise<BikeStateRow | null> {
  // Fresh client — Next.js 14 caches GET fetches by default and supabase-js
  // routes through the same fetch. Even though .rpc() is POST and shouldn't
  // be cached, the helper has had silent staleness issues in production, so
  // defense in depth: never serve stale state to a real customer.
  const supabase = createSupabaseAdminFresh();
  const { data, error } = await supabase.rpc('bike_states', {
    p_from:    from.toISOString(),
    p_to:      to.toISOString(),
    p_bike_id: bikeId,
  });
  if (error) {
    console.error('[bike-state] RPC failed for', bikeId, error);
    throw new Error(`bike_states RPC failed: ${error.message}`);
  }
  const rows = (data ?? []) as BikeStateRow[];
  return rows[0] ?? null;
}

/**
 * Fleet-wide state lookup. Returns one row per bike. Caller filters by
 * `available === true` (and any UI filters: vehicle type, cc bracket, etc.).
 */
export async function getBikeStates(
  from: Date,
  to:   Date,
): Promise<BikeStateRow[]> {
  // Fresh client — Next.js 14 caches GET fetches by default and supabase-js
  // routes through the same fetch. Even though .rpc() is POST and shouldn't
  // be cached, the helper has had silent staleness issues in production, so
  // defense in depth: never serve stale state to a real customer.
  const supabase = createSupabaseAdminFresh();
  const { data, error } = await supabase.rpc('bike_states', {
    p_from:    from.toISOString(),
    p_to:      to.toISOString(),
    p_bike_id: null,
  });
  if (error) {
    console.error('[bike-state] fleet RPC failed:', error);
    throw new Error(`bike_states RPC failed: ${error.message}`);
  }
  return (data ?? []) as BikeStateRow[];
}
