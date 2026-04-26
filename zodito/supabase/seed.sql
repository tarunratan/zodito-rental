-- ============================================================================
-- OPTIONAL: sample data for local development
-- ============================================================================
-- Run this AFTER 001-004. Gives you a handful of platform bikes to browse.
-- Skip this in production.
-- ============================================================================

insert into bikes (model_id, owner_type, registration_number, color, color_hex, year, emoji, listing_status, is_active)
values
  ((select id from bike_models where name = 'activa_6g'),        'platform', 'TS 09 EC 1001', 'Pearl White', '#f0f0f0', 2023, '🛵', 'approved', true),
  ((select id from bike_models where name = 'activa_6g'),        'platform', 'TS 09 EC 1002', 'Matte Black', '#1a1a1a', 2023, '🛵', 'approved', true),
  ((select id from bike_models where name = 'activa_5g_4g'),     'platform', 'TS 09 EB 2001', 'Silver',      '#c0c0c0', 2021, '🛵', 'approved', true),
  ((select id from bike_models where name = 'pulsar_150'),       'platform', 'TS 09 ED 3001', 'Red',         '#dc2626', 2022, '🏍️', 'approved', true),
  ((select id from bike_models where name = 'r15v4'),            'platform', 'TS 09 EE 4001', 'Racing Blue', '#1d4ed8', 2024, '🏍️', 'approved', true),
  ((select id from bike_models where name = 'royal_enfield_350'),'platform', 'TS 09 EF 5001', 'Midnight',    '#1a1a2e', 2023, '🏍️', 'approved', true),
  ((select id from bike_models where name = 'royal_enfield_350'),'platform', 'TS 09 EF 5002', 'Gunmetal',    '#374151', 2023, '🏍️', 'approved', true),
  ((select id from bike_models where name = 'shine_glamour'),    'platform', 'TS 09 EG 6001', 'Silver',      '#c0c0c0', 2022, '🏍️', 'approved', true);
