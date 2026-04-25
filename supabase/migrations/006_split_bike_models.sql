-- ============================================================================
-- SPLIT GROUPED BIKE MODELS INTO INDIVIDUAL MODELS
-- ============================================================================
-- The initial seed grouped bikes with identical pricing into slash-separated
-- display names (e.g. "Honda Activa 6G / Dio / Fascino / Jupiter").
-- This migration splits them into separate selectable models.
-- Existing bike rows that reference the old model_id are unaffected —
-- vendors/admin can re-assign them to the more specific model if needed.
-- ============================================================================

-- ── 1. Rename the existing grouped models ────────────────────────────────────

UPDATE bike_models SET display_name = 'Honda Activa 6G'       WHERE name = 'activa_6g';
UPDATE bike_models SET display_name = 'Honda Activa 5G'       WHERE name = 'activa_5g_4g';
UPDATE bike_models SET display_name = 'Honda Shine 125'       WHERE name = 'shine_glamour';

-- ── 2. Add the split-out models (same pricing tier as their group) ────────────

-- Activa 6G group  →  Dio / Fascino / Jupiter  (110cc, same rates, no weekend override)
INSERT INTO bike_models (name, display_name, category, cc, excess_km_rate, late_hourly_penalty, has_weekend_override)
VALUES
  ('dio',      'Honda Dio',        'scooter', 110, 3.00, 49.00, false),
  ('fascino',  'Yamaha Fascino',   'scooter', 110, 3.00, 49.00, false),
  ('jupiter',  'TVS Jupiter',      'scooter', 110, 3.00, 49.00, false);

-- Activa 5G group  →  Activa 4G  (110cc, same rates, weekend override → activa_6g)
INSERT INTO bike_models (name, display_name, category, cc, excess_km_rate, late_hourly_penalty, has_weekend_override, weekend_override_model_id)
VALUES
  ('activa_4g', 'Honda Activa 4G', 'scooter', 110, 3.00, 49.00, true,
   (SELECT id FROM bike_models WHERE name = 'activa_6g'));

-- Shine group  →  Glamour / HF Deluxe  (125cc, same rates)
INSERT INTO bike_models (name, display_name, category, cc, excess_km_rate, late_hourly_penalty, has_weekend_override)
VALUES
  ('glamour',   'Honda CB Shine / Glamour', 'scooter', 125, 3.00, 49.00, false),
  ('hf_deluxe', 'Hero HF Deluxe',           'scooter', 125, 3.00, 49.00, false);

-- ── 3. Seed packages for each new model (same rates as their group) ───────────

-- Dio  (same as activa_6g)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'dio'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'dio'), '24hr',  499,  140),
  ((SELECT id FROM bike_models WHERE name = 'dio'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'dio'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'dio'), '30day', 6499, 4000);

-- Fascino  (same as activa_6g)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'fascino'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'fascino'), '24hr',  499,  140),
  ((SELECT id FROM bike_models WHERE name = 'fascino'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'fascino'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'fascino'), '30day', 6499, 4000);

-- Jupiter  (same as activa_6g)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'jupiter'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'jupiter'), '24hr',  499,  140),
  ((SELECT id FROM bike_models WHERE name = 'jupiter'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'jupiter'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'jupiter'), '30day', 6499, 4000);

-- Activa 4G  (same as activa_5g_4g)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'activa_4g'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'activa_4g'), '24hr',  449,  140),
  ((SELECT id FROM bike_models WHERE name = 'activa_4g'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'activa_4g'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'activa_4g'), '30day', 6499, 4000);

-- Glamour  (same as shine_glamour)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'glamour'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'glamour'), '24hr',  499,  140),
  ((SELECT id FROM bike_models WHERE name = 'glamour'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'glamour'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'glamour'), '30day', 6499, 4000);

-- HF Deluxe  (same as shine_glamour)
INSERT INTO bike_model_packages (model_id, tier, price, km_limit) VALUES
  ((SELECT id FROM bike_models WHERE name = 'hf_deluxe'), '12hr',  349,  100),
  ((SELECT id FROM bike_models WHERE name = 'hf_deluxe'), '24hr',  499,  140),
  ((SELECT id FROM bike_models WHERE name = 'hf_deluxe'), '7day',  2200, 1000),
  ((SELECT id FROM bike_models WHERE name = 'hf_deluxe'), '15day', 4000, 2000),
  ((SELECT id FROM bike_models WHERE name = 'hf_deluxe'), '30day', 6499, 4000);
