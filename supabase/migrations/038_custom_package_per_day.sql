-- 038: Per-day pricing mode for custom packages.
--
-- Adds two nullable columns to `custom_packages`:
--   per_day_price    — when set, the package is per-day priced.
--   per_day_km_limit — KM allowance per day (multiplied by booked days).
--
-- Pricing resolution at booking time:
--   • per_day_price IS NULL → legacy fixed mode (uses `price` / `km_limit`).
--   • per_day_price IS NOT NULL → days = ceil(actual_hours / 24);
--                                  price = days × per_day_price;
--                                  km_limit = days × per_day_km_limit.
--
-- The legacy `price` / `km_limit` columns are KEPT in sync (admin endpoint
-- computes them from the minimum-day rate) so the "starting from" display
-- on the homepage and the existing `coveringTier` selection logic remain
-- meaningful without further branching. Existing rows are untouched.

ALTER TABLE custom_packages
  ADD COLUMN IF NOT EXISTS per_day_price    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS per_day_km_limit INTEGER;

COMMENT ON COLUMN custom_packages.per_day_price IS
  'When non-null, the package is per-day priced: charge = days × per_day_price for actual booked days within the (min_duration_hours, duration_hours] range. NULL = legacy fixed mode using `price`.';

COMMENT ON COLUMN custom_packages.per_day_km_limit IS
  'KM allowance per day when per_day_price is set. NULL = legacy fixed mode.';

DO $$
BEGIN
  RAISE NOTICE 'custom_packages: per_day_price and per_day_km_limit columns added. Existing rows remain on legacy fixed pricing (per_day_price IS NULL).';
END $$;
