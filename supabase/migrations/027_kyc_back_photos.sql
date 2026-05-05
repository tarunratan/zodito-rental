-- ============================================================================
-- 027 - KYC back-photo columns + RPCs
-- Run this in Supabase SQL Editor.
-- Adds back-side photo storage for DL and Aadhaar, and fixes selfie column.
-- ============================================================================

-- Selfie column (from migration 005 — safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_with_dl_photo_url text;

-- Back-side document columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS dl_back_photo_url      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_back_photo_url text;

-- RPC: set selfie path (bypasses PostgREST schema cache)
CREATE OR REPLACE FUNCTION set_kyc_selfie(p_user_id uuid, p_path text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE users SET selfie_with_dl_photo_url = p_path WHERE id = p_user_id;
$$;

-- RPC: set back-photo paths
CREATE OR REPLACE FUNCTION set_kyc_back_photos(p_user_id uuid, p_dl_back text, p_aadhaar_back text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE users
  SET dl_back_photo_url      = p_dl_back,
      aadhaar_back_photo_url = p_aadhaar_back
  WHERE id = p_user_id;
$$;

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
