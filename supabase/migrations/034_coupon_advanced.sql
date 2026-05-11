-- ============================================================================
-- ADVANCED COUPON RULES
-- ----------------------------------------------------------------------------
-- Extends `coupons` to support three usage models plus optional happy-hour
-- / day-of-week scheduling.
--
--   usage_scope
--     'one_per_user'        – legacy default. Each user can redeem once.
--     'unlimited_per_user'  – e.g. permanent GST waiver. No per-user cap;
--                             only the global `max_uses` (if set) applies.
--     'first_booking_only'  – Only redeemable if the user has zero prior
--                             non-cancelled bookings (welcome offers).
--
--   active_from             – coupon becomes valid from this instant
--                             (null = active immediately). Pair with the
--                             existing `expires_at` for a closed window.
--
--   time_window_start /
--   time_window_end         – wall-clock IST `time` values. When set, the
--                             coupon only redeems if `now()` (in IST) falls
--                             within the window. Crosses-midnight allowed
--                             (e.g. 22:00 → 02:00 is treated as overnight).
--
--   valid_weekdays          – int[] subset of 0..6 (0=Sunday). Null = all
--                             days. Day is evaluated in IST.
-- ============================================================================

create type coupon_usage_scope as enum (
  'one_per_user',
  'unlimited_per_user',
  'first_booking_only'
);

alter table coupons
  add column if not exists usage_scope     coupon_usage_scope not null default 'one_per_user',
  add column if not exists active_from     timestamptz,
  add column if not exists time_window_start time,
  add column if not exists time_window_end   time,
  add column if not exists valid_weekdays    int[]
    check (
      valid_weekdays is null
      or (
        array_length(valid_weekdays, 1) between 1 and 7
        and not exists (select 1 from unnest(valid_weekdays) d where d < 0 or d > 6)
      )
    );

-- Happy-hour pair must be either both null or both set.
alter table coupons
  add constraint coupons_time_window_pair
  check (
    (time_window_start is null and time_window_end is null)
    or (time_window_start is not null and time_window_end is not null)
  );
