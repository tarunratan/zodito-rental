-- ============================================================================
-- 009: Confirm all existing unconfirmed auth users
-- ============================================================================
-- Fixes accounts that were created before email confirmation was bypassed.
-- Safe to run multiple times (UPDATE WHERE email_confirmed_at IS NULL).
-- ============================================================================

UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email_confirmed_at IS NULL;
