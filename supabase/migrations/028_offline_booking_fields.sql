-- Migration 028: Extended offline booking fields + partial payment support
--
-- Adds rich handover-tracking fields to bookings for offline/manual bookings
-- and enables the 20%-now / rest-at-pickup partial payment flow for online bookings.
-- Safe to re-run (all use IF NOT EXISTS / ADD VALUE IF NOT EXISTS).

-- ── New columns on bookings ───────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS alternate_phone       text,
  ADD COLUMN IF NOT EXISTS advance_paid          numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_amount        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odometer_reading      integer,
  ADD COLUMN IF NOT EXISTS helmets_provided      smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_dl_taken     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_detail text,
  ADD COLUMN IF NOT EXISTS payment_proof_url     text;

-- ── New payment_status value ─────────────────────────────────────────────────
-- Postgres 12+ supports IF NOT EXISTS on enum value additions.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_paid';

-- ── Storage bucket for payment proofs ────────────────────────────────────────
-- Admin-only private bucket for payment receipt / proof images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs', 'payment-proofs', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: only service_role (admin API) may insert/read from this bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'payment_proofs_admin_all'
      AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY payment_proofs_admin_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'payment-proofs')
      WITH CHECK (bucket_id = 'payment-proofs');
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Fast admin query: "show me bookings with outstanding balance"
CREATE INDEX IF NOT EXISTS idx_bookings_pending_amount
  ON bookings (pending_amount)
  WHERE pending_amount > 0;

-- ── Column comments ───────────────────────────────────────────────────────────
COMMENT ON COLUMN bookings.advance_paid          IS 'Amount already received (online partial, cash, UPI). Zero until payment collected.';
COMMENT ON COLUMN bookings.pending_amount        IS 'Amount still owed by customer. Collect at pickup. Zero for fully-paid bookings.';
COMMENT ON COLUMN bookings.alternate_phone       IS 'Secondary contact number for the customer.';
COMMENT ON COLUMN bookings.odometer_reading      IS 'Bike odometer (km) recorded at handover.';
COMMENT ON COLUMN bookings.helmets_provided      IS 'Number of helmets handed to customer at pickup.';
COMMENT ON COLUMN bookings.original_dl_taken     IS 'TRUE if shop has taken the original driving licence as collateral.';
COMMENT ON COLUMN bookings.payment_method_detail IS 'How payment was / will be received: cash | upi | online | partial_online.';
COMMENT ON COLUMN bookings.payment_proof_url     IS 'Supabase Storage URL of payment proof screenshot or receipt image.';
