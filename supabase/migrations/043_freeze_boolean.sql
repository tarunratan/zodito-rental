-- 043: Replace time-based freeze logic with a simple `is_frozen` boolean.
--
-- WHY
-- The time-based freeze (`frozen_until` > NOW() AND `frozen_from` IS NULL OR
-- `frozen_from` < NOW()) had multiple failure modes:
--   • Three columns, multiple NULL checks → easy to get wrong
--   • Date math depends on server timezone interpretation
--   • A freeze with `frozen_until` in the past silently "thaws" the bike
--     without any explicit admin action
--   • The SQL function had a 3-condition check; if any one condition was
--     wrong (or interpreted differently across callers) the bike's visibility
--     flipped
-- The admin only really wants "is this bike frozen right now: yes/no".
-- That's a boolean, not a date range. So this migration makes it one.
--
-- WHAT CHANGES
-- 1. New column `bikes.is_frozen BOOLEAN NOT NULL DEFAULT FALSE`.
-- 2. Backfill: for every row where the time-based freeze is currently
--    active per the old logic, set is_frozen = TRUE. Everything else FALSE.
-- 3. Existing columns `frozen_from`, `frozen_until`, `freeze_reason` are
--    KEPT as informational metadata (admin can still record "planned thaw
--    date") but they no longer drive availability.
-- 4. `bike_states` function: the freeze check collapses from 3 conditions
--    to 1 — `b.is_frozen IS DISTINCT FROM FALSE` (i.e., TRUE or NULL).
--    NOT NULL on the column means it'll never be NULL in practice, but
--    the IS DISTINCT guard makes the semantics safe regardless.
-- 5. The companion `bike_states_version()` bumps to a new marker so we can
--    confirm production has the v043 body.
--
-- ROLLOUT
-- This migration is fully backward compatible at the data layer — old
-- code that writes `frozen_until` still compiles, it just won't affect
-- visibility anymore. The freeze endpoint and admin UI are updated in
-- the same commit to write `is_frozen`.

-- ── 1) New boolean column with safe default ───────────────────────────────
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bikes.is_frozen IS
  'Authoritative freeze flag. TRUE = bike hidden from customers regardless of any frozen_until value. Admin Freeze/Unfreeze buttons toggle this directly. The legacy frozen_from / frozen_until / freeze_reason columns remain as informational metadata only.';

-- ── 2) Backfill from existing time-based state ────────────────────────────
-- Any bike that was effectively frozen at migration time stays frozen.
UPDATE bikes
SET is_frozen = TRUE
WHERE frozen_until IS NOT NULL
  AND frozen_until > NOW()
  AND (frozen_from IS NULL OR frozen_from <= NOW())
  AND is_frozen = FALSE; -- idempotent

-- ── 3) Drop and recreate bike_states with the simpler check ───────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bike_states'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', rec.sig);
    RAISE NOTICE 'Dropped overload: %', rec.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION bike_states(
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ,
  p_bike_id UUID DEFAULT NULL
)
RETURNS TABLE (
  bike_id          UUID,
  available        BOOLEAN,
  reason           TEXT,
  is_active        BOOLEAN,
  listing_status   TEXT,
  is_frozen        BOOLEAN,
  frozen_from      TIMESTAMPTZ,
  frozen_until     TIMESTAMPTZ,
  freeze_reason    TEXT,
  packages         JSONB,
  custom_packages  JSONB
)
LANGUAGE SQL
STABLE
AS $$
  WITH
  params AS (
    SELECT
      (NOW() - INTERVAL '2 hours')                AS two_hours_ago,
      (NOW() - INTERVAL '15 minutes')             AS fifteen_min_ago,
      (p_from - INTERVAL '2 days')                AS ongoing_grace_threshold
  ),
  candidate_bikes AS (
    SELECT b.*
    FROM bikes b
    WHERE p_bike_id IS NULL OR b.id = p_bike_id
  ),
  ongoing_blocks AS (
    SELECT DISTINCT bk.bike_id
    FROM bookings bk, params p
    WHERE bk.status = 'ongoing'
      AND bk.end_ts > p.ongoing_grace_threshold
  ),
  time_blocks AS (
    SELECT DISTINCT bk.bike_id
    FROM bookings bk, params p
    WHERE (
        (bk.status = 'confirmed'        AND bk.start_ts   > p.two_hours_ago)
     OR (bk.status = 'pending_payment'  AND bk.created_at > p.fifteen_min_ago)
    )
    AND bk.start_ts < p_to
    AND bk.end_ts   > p_from
  ),
  per_bike_overrides AS (
    SELECT bp.bike_id, bp.tier::text AS tier, bp.price::numeric AS price, bp.km_limit
    FROM bike_packages bp
    JOIN candidate_bikes b ON b.id = bp.bike_id
  ),
  per_bike_model_pkgs AS (
    SELECT b.id AS bike_id, bmp.tier::text AS tier, bmp.price::numeric AS price, bmp.km_limit
    FROM candidate_bikes b
    JOIN bike_model_packages bmp ON bmp.model_id = b.model_id
  ),
  per_bike_merged AS (
    SELECT bike_id, tier, price, km_limit FROM per_bike_overrides
    UNION ALL
    SELECT m.bike_id, m.tier, m.price, m.km_limit
    FROM per_bike_model_pkgs m
    WHERE NOT EXISTS (
      SELECT 1 FROM per_bike_overrides o
      WHERE o.bike_id = m.bike_id AND o.tier = m.tier
    )
  ),
  packages_by_bike AS (
    SELECT bike_id,
      jsonb_agg(jsonb_build_object('tier', tier, 'price', price, 'km_limit', km_limit)) AS pkgs
    FROM per_bike_merged
    GROUP BY bike_id
  ),
  customs_by_bike AS (
    SELECT cp.bike_id,
      jsonb_agg(
        jsonb_build_object(
          'id', cp.id, 'bike_id', cp.bike_id, 'label', cp.label,
          'min_duration_hours', cp.min_duration_hours,
          'duration_hours', cp.duration_hours, 'price', cp.price,
          'km_limit', cp.km_limit, 'per_day_price', cp.per_day_price,
          'per_day_km_limit', cp.per_day_km_limit, 'is_active', cp.is_active
        )
        ORDER BY cp.min_duration_hours
      ) AS customs
    FROM custom_packages cp
    JOIN candidate_bikes b ON b.id = cp.bike_id
    WHERE cp.is_active = TRUE
    GROUP BY cp.bike_id
  )
  SELECT
    b.id AS bike_id,
    -- Availability — five simple boolean checks. NO date math anywhere.
    CASE
      WHEN b.is_active       IS DISTINCT FROM TRUE       THEN FALSE
      WHEN b.listing_status  IS DISTINCT FROM 'approved' THEN FALSE
      WHEN b.is_frozen       IS DISTINCT FROM FALSE      THEN FALSE
      WHEN ob.bike_id IS NOT NULL                        THEN FALSE
      WHEN tb.bike_id IS NOT NULL                        THEN FALSE
      ELSE TRUE
    END AS available,
    -- Reason: same priority order (inactive > unapproved > frozen > ongoing > booked).
    CASE
      WHEN b.is_active       IS DISTINCT FROM TRUE       THEN 'inactive'
      WHEN b.listing_status  IS DISTINCT FROM 'approved' THEN 'unapproved'
      WHEN b.is_frozen       IS DISTINCT FROM FALSE      THEN 'frozen'
      WHEN ob.bike_id IS NOT NULL                        THEN 'ongoing'
      WHEN tb.bike_id IS NOT NULL                        THEN 'booked'
      ELSE NULL
    END AS reason,
    b.is_active,
    b.listing_status,
    b.is_frozen,
    b.frozen_from,
    b.frozen_until,
    b.freeze_reason,
    COALESCE(pb.pkgs,    '[]'::jsonb) AS packages,
    COALESCE(cb.customs, '[]'::jsonb) AS custom_packages
  FROM candidate_bikes b
  LEFT JOIN ongoing_blocks  ob ON ob.bike_id = b.id
  LEFT JOIN time_blocks     tb ON tb.bike_id = b.id
  LEFT JOIN packages_by_bike pb ON pb.bike_id = b.id
  LEFT JOIN customs_by_bike  cb ON cb.bike_id = b.id;
$$;

GRANT EXECUTE ON FUNCTION bike_states(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION bike_states IS
  'Canonical read path for bike availability + merged pricing. v043: freeze check is a single boolean (b.is_frozen) — no more date math. Use bike_states_version() to confirm production has the latest body.';

-- ── 5) Bump the version marker ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bike_states_version() RETURNS TEXT
LANGUAGE SQL IMMUTABLE
AS $$ SELECT '043-is_frozen-boolean-2026-05-15'::TEXT $$;

GRANT EXECUTE ON FUNCTION bike_states_version() TO anon, authenticated, service_role;

DO $$ BEGIN
  RAISE NOTICE 'bike_states recreated with simple is_frozen check. Confirm: SELECT bike_states_version();';
END $$;
