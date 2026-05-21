-- End-of-ride odometer reading. The existing `odometer_reading` column
-- captures the pickup reading; this captures the return reading. `final_km_used`
-- already lives on bookings (km between pickup → return) and gets computed
-- by the admin "Complete Ride" flow from these two values.
alter table public.bookings
  add column if not exists end_odometer_reading int;

comment on column public.bookings.end_odometer_reading is
  'Odometer reading at ride return. final_km_used = end_odometer_reading - odometer_reading.';
