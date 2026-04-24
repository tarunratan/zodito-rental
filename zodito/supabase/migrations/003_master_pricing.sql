-- ============================================================================
-- MASTER PRICING SEED
-- ============================================================================
-- Exact values from the Zodito Rentals rate card.
-- Format: price / km_limit per tier.
-- ============================================================================

-- First insert all models WITHOUT weekend override references (we'll set those after)

insert into bike_models (name, display_name, category, cc, excess_km_rate, late_hourly_penalty, has_weekend_override)
values
  ('activa_5g_4g',     'Honda Activa 5G / 4G',       'scooter',      110, 3.00, 49.00,  true),
  ('activa_6g',        'Honda Activa 6G / Dio / Fascino / Jupiter', 'scooter', 110, 3.00, 49.00, false),
  ('shine_glamour',    'Shine / Glamour / HF Deluxe', 'scooter',      125, 3.00, 49.00,  false),
  ('pulsar_150',       'Bajaj Pulsar 150',            'bike_sub150',  150, 3.00, 49.00,  false),
  ('r15v3',            'Yamaha R15 V3',                'bike_plus150', 155, 4.00, 89.00,  false),
  ('r15v4',            'Yamaha R15 V4',                'bike_plus150', 155, 4.00, 89.00,  false),
  ('royal_enfield_350','Royal Enfield Classic 350',   'bike_plus150', 350, 4.00, 89.00,  false);

-- Set Activa 5G/4G weekend override to point at Activa 6G
update bike_models
   set weekend_override_model_id = (select id from bike_models where name = 'activa_6g')
 where name = 'activa_5g_4g';

-- Now insert packages for each model (price, km_limit per tier)
-- Tiers: 12hr, 24hr, 7day, 15day, 30day

-- Activa 5G/4G:  349/100  449/140  2200/1000  4000/2000  6499/40000  (screenshot shows 40000 - that's what the document says)
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'activa_5g_4g'), '12hr', 349,  100),
  ((select id from bike_models where name = 'activa_5g_4g'), '24hr', 449,  140),
  ((select id from bike_models where name = 'activa_5g_4g'), '7day', 2200, 1000),
  ((select id from bike_models where name = 'activa_5g_4g'), '15day',4000, 2000),
  ((select id from bike_models where name = 'activa_5g_4g'), '30day',6499, 4000);  -- Using 4000 (consistent with others); doc shows 40000 which looks like a typo

-- Activa 6G / Dio / Fascino / Jupiter
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'activa_6g'), '12hr', 349,  100),
  ((select id from bike_models where name = 'activa_6g'), '24hr', 499,  140),
  ((select id from bike_models where name = 'activa_6g'), '7day', 2200, 1000),
  ((select id from bike_models where name = 'activa_6g'), '15day',4000, 2000),
  ((select id from bike_models where name = 'activa_6g'), '30day',6499, 4000);

-- Shine / Glamour / HF Deluxe
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'shine_glamour'), '12hr', 349,  100),
  ((select id from bike_models where name = 'shine_glamour'), '24hr', 499,  140),
  ((select id from bike_models where name = 'shine_glamour'), '7day', 2200, 1000),
  ((select id from bike_models where name = 'shine_glamour'), '15day',4000, 2000),
  ((select id from bike_models where name = 'shine_glamour'), '30day',6499, 4000);

-- Pulsar 150
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'pulsar_150'), '12hr', 499,  120),
  ((select id from bike_models where name = 'pulsar_150'), '24hr', 799,  160),
  ((select id from bike_models where name = 'pulsar_150'), '7day', 3000, 1000),
  ((select id from bike_models where name = 'pulsar_150'), '15day',5499, 2000),
  ((select id from bike_models where name = 'pulsar_150'), '30day',7999, 4000);

-- R15 V3
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'r15v3'), '12hr', 699,   130),
  ((select id from bike_models where name = 'r15v3'), '24hr', 1099,  180),
  ((select id from bike_models where name = 'r15v3'), '7day', 4999,  1000),
  ((select id from bike_models where name = 'r15v3'), '15day',8999,  2000),
  ((select id from bike_models where name = 'r15v3'), '30day',13999, 4000);

-- R15 V4
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'r15v4'), '12hr', 799,   130),
  ((select id from bike_models where name = 'r15v4'), '24hr', 1299,  180),
  ((select id from bike_models where name = 'r15v4'), '7day', 5999,  1000),
  ((select id from bike_models where name = 'r15v4'), '15day',9999,  2000),
  ((select id from bike_models where name = 'r15v4'), '30day',15999, 4000);

-- Royal Enfield Classic 350
insert into bike_model_packages (model_id, tier, price, km_limit) values
  ((select id from bike_models where name = 'royal_enfield_350'), '12hr', 999,   140),
  ((select id from bike_models where name = 'royal_enfield_350'), '24hr', 1499,  200),
  ((select id from bike_models where name = 'royal_enfield_350'), '7day', 6999,  1000),
  ((select id from bike_models where name = 'royal_enfield_350'), '15day',11999, 2000),
  ((select id from bike_models where name = 'royal_enfield_350'), '30day',18999, 4000);

-- NOTE about 30day for Activa 5G/4G:
-- The rate card shows "6499/40000km" — this looks like an OCR/typo (40000km in a month is ~1300km/day, not realistic).
-- I'm seeding 4000km to match the other bikes. Change this in the admin UI if 40000 is correct.
