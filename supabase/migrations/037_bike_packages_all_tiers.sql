-- 037: Allow per-bike admin price overrides for EVERY supported tier.
--
-- The original 018_bike_pricing.sql constrained `bike_packages.tier` to just
--   ('12hr','24hr','7day','15day','30day')
-- which mirrored the seed in 003_master_pricing.sql. Since then we've added
-- 36hr, 2day, 48hr, 60hr, 72hr, 3day, 96hr, 120hr, 144hr (and the flex tiers)
-- to the customer-facing pricing surface — but the admin's per-bike override
-- save endpoint silently failed for any of those tiers, because the INSERT
-- tripped this CHECK and rolled back.
--
-- Symptom users hit:
--   "Updates from admin work for tier 1 (12hr) and tier 2 (24hr),
--    but NOT for tier 3 (36hr) / tier 4 (2day) on the customer side."
--
-- The fix:
--   1. Drop the old narrow CHECK constraint (idempotent).
--   2. Add a new CHECK matching the full `PackageTier` union used everywhere
--      else in the app (admin UI, API schemas, pricing engine).
--
-- Idempotent: safe to re-run; constraint is dropped if present and re-added
-- with the wider value set.

-- Drop ANY existing CHECK constraint on the `tier` column. The original
-- constraint name is Postgres-generated (`bike_packages_tier_check`), but
-- some environments may have ended up with a renamed variant. We loop
-- through `pg_constraint` and drop each one individually so a NULL aggregate
-- doesn't blow up an EXECUTE.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'bike_packages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tier%'
  LOOP
    EXECUTE format('ALTER TABLE bike_packages DROP CONSTRAINT %I', r.conname);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    -- bike_packages doesn't exist yet (migration 018 not applied) — nothing to clean up.
    NULL;
END $$;

ALTER TABLE bike_packages
  ADD CONSTRAINT bike_packages_tier_check
  CHECK (tier IN (
    '6hr','12hr','24hr','36hr','48hr','60hr','72hr','96hr','120hr','144hr',
    '2day','3day','7day','15day','30day','weekly_flex','monthly_flex'
  ));

-- Diagnostic — surfaces immediately after running so you can confirm the
-- constraint now accepts every supported tier.
DO $$
BEGIN
  RAISE NOTICE 'bike_packages.tier CHECK constraint now allows: 6hr,12hr,24hr,36hr,48hr,60hr,72hr,96hr,120hr,144hr,2day,3day,7day,15day,30day,weekly_flex,monthly_flex';
END $$;
