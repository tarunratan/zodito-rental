-- ============================================================================
-- 005 - KYC selfie column (Chunk 2 addition)
-- ============================================================================
-- Adds selfie_with_dl_photo_url for the fraud-check selfie.
-- Also adds an RPC helper so the API route can set it without needing to
-- worry about column existence (we chose jsonb-free approach for simplicity).
-- ============================================================================

alter table users
  add column if not exists selfie_with_dl_photo_url text;

-- Small helper RPC so API routes don't have to care about schema evolution
create or replace function set_kyc_selfie(p_user_id uuid, p_path text)
returns void language sql as $$
  update users set selfie_with_dl_photo_url = p_path where id = p_user_id;
$$;
