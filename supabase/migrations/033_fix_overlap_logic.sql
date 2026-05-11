-- ============================================================================
-- FIX: overlap / availability false-positives
-- ----------------------------------------------------------------------------
-- Problem the previous logic had:
--
--   `get_unavailable_bike_ids` blocked every status except 'cancelled' and
--   'payment_failed'. That incorrectly included 'completed' rides (which free
--   the bike) and 'pending_payment' rows that have already passed their
--   payment deadline (effectively expired reservations).
--
-- Canonical rule (matches src/lib/booking-overlap.ts):
--
--   • 'confirmed' and 'ongoing'        → ALWAYS block.
--   • 'pending_payment'                → block ONLY while payment_deadline > now().
--   • 'completed' / 'cancelled' /
--     'payment_failed'                 → NEVER block.
--
-- Half-open overlap: newPickup < existingDrop AND newDrop > existingPickup.
-- Back-to-back slots (newPickup == existingDrop) do NOT overlap.
-- ============================================================================

create or replace function get_unavailable_bike_ids(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(bike_id uuid)
language sql
stable
as $$
  -- Bikes with overlapping ACTIVE bookings.
  -- pending_payment rows only count while they still have a live deadline.
  select distinct b.bike_id
  from bookings b
  where (
          b.status in ('confirmed', 'ongoing')
       or (b.status = 'pending_payment' and b.payment_deadline > now())
        )
    and b.start_ts < p_to
    and b.end_ts   > p_from

  union

  -- Bikes with overlapping freeze windows
  select distinct bk.id
  from bikes bk
  where bk.frozen_from  is not null
    and bk.frozen_until is not null
    and bk.frozen_from  < p_to
    and bk.frozen_until > p_from
$$;

-- Refresh the partial index to match the corrected predicate set so the
-- planner can still serve overlap queries cheaply.
drop index if exists idx_bookings_availability;
create index idx_bookings_availability
  on bookings(bike_id, start_ts, end_ts)
  where status in ('confirmed', 'ongoing', 'pending_payment');
