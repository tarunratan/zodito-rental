-- Honda Shine / Glamour / HF Deluxe were seeded as `scooter` but are 125cc
-- commuter motorcycles. Putting them in the scooter bucket made customers
-- see HF Deluxe on the home page when they tapped the "Scooters" tab.
-- Re-categorize to bike_sub150 (the "125–150cc" filter bucket).
update public.bike_models
   set category = 'bike_sub150'
 where name in ('shine_glamour', 'shine', 'glamour', 'hf_deluxe', 'hfdeluxe')
   and category = 'scooter';

-- Defensive: anything whose display_name explicitly mentions Shine /
-- Glamour / HF Deluxe and is still flagged as a scooter — pull it out too.
-- A scooter genuinely won't have any of these tokens in its display name.
update public.bike_models
   set category = 'bike_sub150'
 where category = 'scooter'
   and (
        display_name ilike '%shine%'
     or display_name ilike '%glamour%'
     or display_name ilike '%hf deluxe%'
     or display_name ilike '%hf-deluxe%'
   );
