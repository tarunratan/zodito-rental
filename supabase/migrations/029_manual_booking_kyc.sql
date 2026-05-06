-- Migration 029: KYC document storage for manual / offline bookings
--
-- Admin can upload DL front/back, Aadhaar front/back and a selfie
-- directly from the manual booking form. Paths stored on the booking row.
-- All docs go into the existing private kyc-docs bucket.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS kyc_dl_front_url      text,
  ADD COLUMN IF NOT EXISTS kyc_dl_back_url       text,
  ADD COLUMN IF NOT EXISTS kyc_aadhaar_front_url text,
  ADD COLUMN IF NOT EXISTS kyc_aadhaar_back_url  text,
  ADD COLUMN IF NOT EXISTS kyc_selfie_url        text;

COMMENT ON COLUMN bookings.kyc_dl_front_url      IS 'Supabase Storage path — driving licence (front).';
COMMENT ON COLUMN bookings.kyc_dl_back_url       IS 'Supabase Storage path — driving licence (back).';
COMMENT ON COLUMN bookings.kyc_aadhaar_front_url IS 'Supabase Storage path — Aadhaar card (front).';
COMMENT ON COLUMN bookings.kyc_aadhaar_back_url  IS 'Supabase Storage path — Aadhaar card (back).';
COMMENT ON COLUMN bookings.kyc_selfie_url        IS 'Supabase Storage path — selfie with document.';
