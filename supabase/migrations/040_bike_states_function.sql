-- 040: `bike_states` — canonical read path for availability + merged pricing.
--
-- WHY THIS EXISTS
-- Every "is this bike available + at what price for these dates?" question
-- used to be answered by ~7 different routes (home list, detail page, quote
-- endpoint, booking-create, booking-create-cash, extension-quote, manual-
-- booking) each re-deriving the same truth from raw tables. Every endpoint
-- had its own subtle bug at some point (NULL frozen_from filter, unconditional
-- ongoing block, missing visibility filter, left-join package merge, …).
-- Drift was a function of the number of derivation sites.
--
-- This function collapses all of that into ONE SQL projection. Every call
-- site that asks "what's the state of this bike (or all bikes) for [from, to]?"
-- routes through here and sees the same answer.
--
-- WHAT IT RETURNS
-- For each bike row (or one specific bike when `p_bike_id` is non-null):
--   • availability flag + the single discriminating reason
--   • the visibility / freeze raw columns (for diagnostics + UI banners)
--   • UNION-merged packages — model defaults overlaid by per-bike overrides
--   • active custom_packages — including per-day fields
--
-- WHAT IT DOES NOT DO
-- Pure pricing math (which tier covers which duration, GST, helmet add-ons).
-- That stays in JS / TS so we can keep the existing test coverage of
-- `coveringTier` and `calculatePrice`. The function guarantees that
-- pricing JS gets IDENTICAL input no matter who called it.
--
-- SECURITY
-- The function is STABLE (no side effects) and reads only public tables.
-- Granted to `anon`, `authenticated`, and `service_role`. Reads bypass RLS
-- when called from the service-role key (the only caller pattern today).
--
-- AVAILABILITY SEMANTICS — match what the routes did at commit ec0c379:
--   inactive    → bikes.is_active IS DISTINCT FROM TRUE
--   unapproved  → bikes.listing_status IS DISTINCT FROM 'approved'
--   ongoing     → exists ongoing booking with end_ts > (from − 2 days)
--                 (2-day grace lets near-future searches inherit blocks
--                  from currently-out bikes; far-future searches don't)
--   booked      → exists confirmed/pending_payment overlap, with the
--                 confirmed-recency + pending_payment-TTL guards
--   frozen      → freeze-window overlaps [from, to], NULL frozen_from
--                 treated as -infinity (the canonical helper's semantics)
-- Reason priority: inactive > unapproved > ongoing > booked > frozen.

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
  -- Candidate bikes — scoped to one id if requested, else the full fleet.
  candidate_bikes AS (
    SELECT b.*
    FROM bikes b
    WHERE p_bike_id IS NULL OR b.id = p_bike_id
  ),
  -- Ongoing rentals that are still considered "out". Past their scheduled
  -- end-plus-grace they're assumed cleared (the original unconditional
  -- block was the source of the "17 bikes unavailable 5 months out" bug).
  ongoing_blocks AS (
    SELECT DISTINCT bk.bike_id
    FROM bookings bk, params p
    WHERE bk.status = 'ongoing'
      AND bk.end_ts > p.ongoing_grace_threshold
  ),
  -- Time-window overlap with confirmed / pending_payment, with the same
  -- recency guards (2hrs for confirmed-no-show, 15min for pending_payment).
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
  -- UNION-merge of model packages + per-bike overrides.
  -- Override wins on conflict; tiers present in only one source still surface.
  -- This is the SQL twin of `mergeBikePackages` in src/lib/pricing.ts.
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
  -- Active customs (per-day fields included so callers don't need a join).
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
    -- Available = none of the blocking conditions fire.
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
    -- Discriminating reason. Same priority order as the JS callers' switch
    -- statements so the banners + diagnostics keep matching.
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
  'Canonical read path for bike availability + merged pricing. Every customer-facing API route that asks "is bike(s) available + at what price for [from, to]?" should call this function so every route sees identical data. See migration 040 header for full semantics.';

DO $$ BEGIN RAISE NOTICE 'bike_states(TIMESTAMPTZ, TIMESTAMPTZ, UUID) ready. Available to anon/authenticated/service_role.'; END $$;
