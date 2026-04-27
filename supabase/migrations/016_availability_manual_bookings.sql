-- ============================================================================
-- AVAILABILITY + MANUAL BOOKINGS
-- ============================================================================

-- Add source column to bookings
alter table bookings
  add column if not exists source text not null default 'online'
  check (source in ('online', 'manual'));

-- Add customer_name / customer_phone for manual (offline) bookings
alter table bookings
  add column if not exists customer_name text,
  add column if not exists customer_phone text;

-- Performance index for availability queries
create index if not exists idx_bookings_availability
  on bookings(bike_id, start_ts, end_ts)
  where status not in ('cancelled', 'payment_failed');

-- ============================================================================
-- RPC: get_unavailable_bike_ids(from_ts, to_ts)
-- Returns bike_ids that are unavailable for the given window.
-- Used by the availability API to filter out booked/frozen bikes.
-- ============================================================================
create or replace function get_unavailable_bike_ids(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(bike_id uuid)
language sql
stable
as $$
  -- Bikes with overlapping confirmed bookings
  select distinct b.bike_id
  from bookings b
  where b.status not in ('cancelled', 'payment_failed')
    and b.start_ts < p_to
    and b.end_ts   > p_from

  union

  -- Bikes with overlapping freeze windows
  select distinct bk.id
  from bikes bk
  where bk.frozen_from is not null
    and bk.frozen_until is not null
    and bk.frozen_from < p_to
    and bk.frozen_until > p_from
$$;
