-- ============================================================================
-- DB FUNCTIONS
-- ============================================================================

-- Mark pending bookings as payment_failed if payment deadline has passed.
-- Should be called by a cron job (Supabase scheduled edge function OR
-- a pg_cron job, OR just called opportunistically when reading bookings).
create or replace function expire_unpaid_bookings()
returns int language plpgsql as $$
declare
  n int;
begin
  update bookings
     set status = 'payment_failed',
         payment_status = 'failed',
         updated_at = now()
   where status = 'pending_payment'
     and payment_deadline < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Check if a given time window is free for a bike
-- (ignores pending_payment bookings that have expired)
create or replace function is_slot_available(
  p_bike_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz
) returns boolean language sql stable as $$
  select not exists (
    select 1 from bookings
     where bike_id = p_bike_id
       and status in ('pending_payment', 'confirmed', 'ongoing')
       and not (status = 'pending_payment' and payment_deadline < now())
       and tstzrange(start_ts, end_ts, '[)') && tstzrange(p_start_ts, p_end_ts, '[)')
  )
$$;

-- Get all booked time ranges for a bike (for showing calendar availability)
create or replace function bike_busy_ranges(
  p_bike_id uuid,
  p_from timestamptz default now(),
  p_to   timestamptz default now() + interval '90 days'
) returns table(start_ts timestamptz, end_ts timestamptz, status booking_status)
language sql stable as $$
  select start_ts, end_ts, status
    from bookings
   where bike_id = p_bike_id
     and status in ('pending_payment', 'confirmed', 'ongoing')
     and not (status = 'pending_payment' and payment_deadline < now())
     and start_ts < p_to
     and end_ts > p_from
   order by start_ts
$$;
