-- Migration 025: Relax kyc-docs bucket limits
--
-- Previous migration set a 10 MB file_size_limit and specific MIME types.
-- Gallery photos (especially HEIC from iOS) can exceed 10 MB, causing Supabase
-- to drop the connection before sending a proper error (browser sees "Failed to
-- fetch"). We now compress everything to JPEG client-side, but we also relax
-- the server-side limit as a belt-and-suspenders measure.
--
-- allowed_mime_types = NULL means "accept any MIME type" in Supabase Storage.
-- Client-side Canvas compression guarantees the actual bytes are always JPEG.

UPDATE storage.buckets
SET
  file_size_limit     = 20971520,  -- 20 MB (raw HEIC files before client compress)
  allowed_mime_types  = NULL       -- accept any image format
WHERE id = 'kyc-docs';
