-- 018: Per-bike package price overrides
-- Admin can set custom price + km_limit per tier per bike,
-- overriding the model-level defaults from bike_model_packages.

CREATE TABLE IF NOT EXISTS bike_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id     UUID NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL CHECK (tier IN ('12hr','24hr','7day','15day','30day')),
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  km_limit    INTEGER NOT NULL CHECK (km_limit >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bike_id, tier)
);

ALTER TABLE bike_packages ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for bike detail page pricing display)
CREATE POLICY "bike_packages_public_read" ON bike_packages
  FOR SELECT USING (true);

-- Only admins can write
CREATE POLICY "bike_packages_admin_write" ON bike_packages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_bike_packages_bike_id ON bike_packages(bike_id);
