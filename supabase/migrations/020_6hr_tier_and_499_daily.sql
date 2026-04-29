-- Migration 020: Add 6hr tier at ₹350 and set all 24hr packages to ₹499

-- 1. Extend the package_tier enum with '6hr' (before '12hr' for ordering)
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '6hr' BEFORE '12hr';

-- 2. Add 6hr package (₹350, 50 km) for every bike model that doesn't have one yet
INSERT INTO bike_model_packages (model_id, tier, price, km_limit)
SELECT id, '6hr', 350, 50
FROM bike_models
ON CONFLICT (model_id, tier) DO NOTHING;

-- 3. Set ALL 24hr model packages to ₹499
UPDATE bike_model_packages SET price = 499 WHERE tier = '24hr';

-- 4. Clear any per-bike 24hr price overrides so the model default takes effect
DELETE FROM bike_packages WHERE tier = '24hr';

-- 5. Clear any per-bike 6hr overrides (shouldn't exist yet, but belt-and-suspenders)
DELETE FROM bike_packages WHERE tier = '6hr';
