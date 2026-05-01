-- Migration 023: Add 2-day and 3-day package tiers
--
-- ⚠️  IMPORTANT — run in TWO separate executions in Supabase SQL Editor
--     because PostgreSQL cannot use a newly-added enum value in the same
--     transaction that added it.
--
-- === STEP 1: Run this block ALONE first ===
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '2day' AFTER '24hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '3day' AFTER '2day';

-- === STEP 2: Run these AFTER step 1 has committed ===

-- 2-day package: 2× the model's 24hr price and km_limit
INSERT INTO bike_model_packages (model_id, tier, price, km_limit)
SELECT bmp.model_id, '2day', bmp.price * 2, bmp.km_limit * 2
FROM bike_model_packages bmp
WHERE bmp.tier = '24hr'
ON CONFLICT (model_id, tier) DO NOTHING;

-- 3-day package: 3× the model's 24hr price and km_limit
INSERT INTO bike_model_packages (model_id, tier, price, km_limit)
SELECT bmp.model_id, '3day', bmp.price * 3, bmp.km_limit * 3
FROM bike_model_packages bmp
WHERE bmp.tier = '24hr'
ON CONFLICT (model_id, tier) DO NOTHING;
