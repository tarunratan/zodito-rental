-- 042: Force-replace `bike_states` to defeat a stale function body in production.
--
-- INCIDENT 2026-05-15
-- Bike `2fa7d75f` (Royal Enfield Classic 350) had `is_active=false` in the
-- `bikes` table (verified by /api/debug/bike-raw, which does a direct SELECT).
-- But the home API kept showing the bike. The home API calls `bike_states(...)`
-- via PostgREST RPC, and the function was returning `is_active=true` and
-- `available=true` for that same row.
--
-- The only way the function and a direct table SELECT can disagree on a
-- column value is if the deployed function body is older than what migration
-- 040 defines. `CREATE OR REPLACE FUNCTION` should update in place, but if
-- a different overload was created earlier (different parameter list, default
-- types, etc.) the old body can survive — `CREATE OR REPLACE` only replaces
-- the function with the exact same signature.
--
-- THIS MIGRATION
-- 1) Hard-DROPs every overload of `bike_states` so no stale body can linger.
-- 2) Re-runs the canonical definition from migration 040, verbatim.
-- 3) Adds a tiny companion function `bike_states_version()` that returns
--    a string we can compare in production to confirm the right body shipped.
--    If the home is misbehaving again, hit `select bike_states_version()`
--    in Supabase SQL editor — if it returns anything other than the
--    constant below, production is on a stale version.

-- ── 1) DROP all overloads ──────────────────────────────────────────────────
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
    RAISE NOTICE 'Dropped stale overload: %', rec.sig;
  END LOOP;
END $$;

-- ── 2) Re-create the canonical body. Identical to migration 040. ──────────
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
      jsonb_agg(
        jsonb_build_object(
          'tier', tier,
          'price', price,
          'km_limit', km_limit
        )
      ) AS pkgs
    FROM per_bike_merged
    GROUP BY bike_id
  ),
  customs_by_bike AS (
    SELECT cp.bike_id,
      jsonb_agg(
        jsonb_build_object(
          'id',                 cp.id,
          'bike_id',            cp.bike_id,
          'label',              cp.label,
          'min_duration_hours', cp.min_duration_hours,
          'duration_hours',     cp.duration_hours,
          'price',              cp.price,
          'km_limit',           cp.km_limit,
          'per_day_price',      cp.per_day_price,
          'per_day_km_limit',   cp.per_day_km_limit,
          'is_active',          cp.is_active
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
    CASE
      WHEN b.is_active       IS DISTINCT FROM TRUE       THEN FALSE
      WHEN b.listing_status  IS DISTINCT FROM 'approved' THEN FALSE
      WHEN ob.bike_id IS NOT NULL                        THEN FALSE
      WHEN tb.bike_id IS NOT NULL                        THEN FALSE
      WHEN (b.frozen_until IS NOT NULL
            AND b.frozen_until > p_from
            AND (b.frozen_from IS NULL OR b.frozen_from < p_to)) THEN FALSE
      ELSE TRUE
    END AS available,
    CASE
      WHEN b.is_active       IS DISTINCT FROM TRUE       THEN 'inactive'
      WHEN b.listing_status  IS DISTINCT FROM 'approved' THEN 'unapproved'
      WHEN ob.bike_id IS NOT NULL                        THEN 'ongoing'
      WHEN tb.bike_id IS NOT NULL                        THEN 'booked'
      WHEN (b.frozen_until IS NOT NULL
            AND b.frozen_until > p_from
            AND (b.frozen_from IS NULL OR b.frozen_from < p_to)) THEN 'frozen'
      ELSE NULL
    END AS reason,
    b.is_active,
    b.listing_status,
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
  'Canonical read path for bike availability + merged pricing. Migration 042 dropped stale overloads; see migration 040 header for full semantics. Use bike_states_version() to confirm production has the latest body.';

-- ── 3) Version marker so production can prove it has the latest body ──────
CREATE OR REPLACE FUNCTION bike_states_version() RETURNS TEXT
LANGUAGE SQL IMMUTABLE
AS $$ SELECT '042-table-authority-2026-05-15'::TEXT $$;

GRANT EXECUTE ON FUNCTION bike_states_version() TO anon, authenticated, service_role;

DO $$ BEGIN
  RAISE NOTICE 'bike_states force-replaced. Confirm in production with: SELECT bike_states_version();';
END $$;
