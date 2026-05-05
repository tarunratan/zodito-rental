-- Custom per-bike pricing packages (admin-defined, arbitrary durations)
CREATE TABLE IF NOT EXISTS custom_packages (
  id              uuid            DEFAULT gen_random_uuid() PRIMARY KEY,
  bike_id         uuid            NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  label           TEXT            NOT NULL,
  duration_hours  INTEGER         NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 720),
  price           NUMERIC(10,2)   NOT NULL,
  km_limit        INTEGER         NOT NULL,
  is_active       BOOLEAN         NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ     DEFAULT NOW(),
  UNIQUE(bike_id, duration_hours)
);

ALTER TABLE custom_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on custom_packages"
  ON custom_packages FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow the booking APIs (which run as service_role) to read custom_packages
-- service_role bypasses RLS, so no extra policy needed for that.

-- Allow public (unauthenticated bike detail page) to read active custom packages
CREATE POLICY "Public read active custom_packages"
  ON custom_packages FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Bookings: add nullable custom_package_id + make package_tier nullable
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS custom_package_id uuid REFERENCES custom_packages(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ALTER COLUMN package_tier DROP NOT NULL;
