-- Migration 030: Custom package duration ranges
--
-- Adds min_duration_hours so admin can define packages that apply to
-- a range of durations (e.g. 7–9 days, 9–15 days) rather than an exact match.
-- duration_hours becomes the upper bound; min_duration_hours is the lower bound.
-- Drop the old exact-duration unique constraint since ranges share max values.

ALTER TABLE custom_packages
  ADD COLUMN IF NOT EXISTS min_duration_hours int NOT NULL DEFAULT 0;

-- Drop old exact-duration unique index — ranges allow different min with same max
ALTER TABLE custom_packages DROP CONSTRAINT IF EXISTS custom_packages_bike_id_duration_hours_key;

-- Prevent exact duplicates (same min AND max for same bike)
ALTER TABLE custom_packages
  ADD CONSTRAINT custom_packages_bike_range_unique
  UNIQUE (bike_id, min_duration_hours, duration_hours);

COMMENT ON COLUMN custom_packages.min_duration_hours IS 'Lower bound (hours). Package applies when booking duration >= this value.';
COMMENT ON COLUMN custom_packages.duration_hours     IS 'Upper bound (hours). Package applies when booking duration <= this value.';
