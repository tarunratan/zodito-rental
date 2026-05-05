-- 019: Expanded pricing tiers + user profile address
-- Adds all granular hourly tiers plus weekly/monthly flex brackets

-- ── 1. Expand package_tier enum ──────────────────────────────────────────────
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '6hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '2day';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '3day';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '36hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '48hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '60hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '72hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '96hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '120hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS '144hr';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS 'weekly_flex';
ALTER TYPE package_tier ADD VALUE IF NOT EXISTS 'monthly_flex';

-- ── 2. Widen bike_packages CHECK constraint ───────────────────────────────────
ALTER TABLE bike_packages DROP CONSTRAINT IF EXISTS bike_packages_tier_check;
ALTER TABLE bike_packages ADD CONSTRAINT bike_packages_tier_check
  CHECK (tier IN (
    '6hr','12hr','24hr','36hr','48hr','60hr','72hr','96hr','120hr','144hr',
    '2day','3day','7day','15day','30day',
    'weekly_flex','monthly_flex'
  ));

-- ── 3. User profile: address field ───────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

-- ── 4. User profile photo ─────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
