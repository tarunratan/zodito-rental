-- 039: Allow custom packages with durations longer than 30 days.
--
-- Migration 026 capped `duration_hours` at 720 (30 days):
--    CHECK (duration_hours > 0 AND duration_hours <= 720)
--
-- That was meant for the pre-per-day pricing model where customs were
-- short, fixed-price addons. With per-day pricing (commit efef068) admins
-- routinely create long ranges — "monthly", "quarterly", "annual lease"
-- — and the CHECK trips with:
--    new row for relation "custom_packages" violates check constraint
--    "custom_packages_duration_hours_check"
--
-- This migration relaxes the upper bound to 8760 hours (one year), matches
-- the Zod schema in /api/admin/bikes/[id]/custom-packages, and also adds
-- a matching CHECK on `min_duration_hours` so it can't be > duration_hours
-- or negative.
--
-- Idempotent: looks up the existing constraint by introspecting
-- pg_constraint so renamed variants still get dropped cleanly.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'custom_packages'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%duration_hours%'
        AND pg_get_constraintdef(oid) ILIKE '%720%'
      )
  LOOP
    EXECUTE format('ALTER TABLE custom_packages DROP CONSTRAINT %I', r.conname);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE custom_packages
  ADD CONSTRAINT custom_packages_duration_hours_check
  CHECK (duration_hours > 0 AND duration_hours <= 8760);

-- Reciprocal check for the lower bound — was missing entirely.
ALTER TABLE custom_packages
  DROP CONSTRAINT IF EXISTS custom_packages_min_duration_hours_check;

ALTER TABLE custom_packages
  ADD CONSTRAINT custom_packages_min_duration_hours_check
  CHECK (min_duration_hours >= 0 AND min_duration_hours < duration_hours);

DO $$
BEGIN
  RAISE NOTICE 'custom_packages: duration_hours range relaxed to (0, 8760]; min_duration_hours bounded to [0, duration_hours).';
END $$;
