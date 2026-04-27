-- ─────────────────────────────────────────────────────────────────
-- 017  Performance indexes
-- Run once in Supabase SQL Editor.
-- All indexes are IF NOT EXISTS — safe to re-run.
-- ─────────────────────────────────────────────────────────────────

-- ── bookings: availability overlap queries ──────────────────────
-- Covers the two-column range filter used by /api/bikes/available:
--   WHERE status NOT IN ('cancelled','payment_failed')
--     AND start_ts < $to
--     AND end_ts   > $from
-- Partial because cancelled/payment_failed rows never block availability.
CREATE INDEX IF NOT EXISTS idx_bookings_overlap
  ON bookings (bike_id, start_ts, end_ts)
  WHERE status IN ('pending_payment', 'confirmed', 'ongoing');

-- ── bookings: admin list — sort + limit ──────────────────────────
-- Admin page loads newest 200 bookings. (created_at DESC already
-- uses a seq-scan on small tables but this helps as volume grows.)
CREATE INDEX IF NOT EXISTS idx_bookings_created_at
  ON bookings (created_at DESC);

-- ── bikes: freeze-window overlap (availability check) ────────────
-- Already covered by idx_bikes_frozen WHERE frozen_until IS NOT NULL,
-- but adding frozen_from to the index avoids an extra filter step.
CREATE INDEX IF NOT EXISTS idx_bikes_freeze_window
  ON bikes (frozen_from, frozen_until)
  WHERE frozen_until IS NOT NULL AND frozen_from IS NOT NULL;

-- ── users: auth lookup ───────────────────────────────────────────
-- getCurrentAppUser() does:  WHERE auth_id = $1
-- auth_id is the Supabase auth.users UUID — must be fast on every request.
CREATE INDEX IF NOT EXISTS idx_users_auth_id
  ON users (auth_id);

-- ── coupon_uses: per-user coupon check ───────────────────────────
-- Booking create checks: WHERE coupon_id = $1 AND user_id = $2
CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon_user
  ON coupon_uses (coupon_id, user_id);

-- ── bike_model_packages: model lookup ────────────────────────────
-- Already has idx_bmp_model_id per migration 001; add covering columns
-- for the SELECT (tier, price, km_limit) so Postgres uses index-only scan.
CREATE INDEX IF NOT EXISTS idx_bmp_covering
  ON bike_model_packages (model_id, tier, price, km_limit);
