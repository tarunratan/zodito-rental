-- 044: Generated IST display columns for Supabase-dashboard visibility.
--
-- WHY
-- All our `timestamptz` columns are stored internally as UTC (that's how the
-- Postgres type is defined — every value is normalized to UTC on write).
-- When the admin opens the Supabase dashboard they see UTC, which is 5h30m
-- behind the wall-clock they entered. That has caused multiple "the freeze
-- is wrong / the booking is wrong" panics that turned out to be the admin
-- mentally subtracting 5h30m wrong.
--
-- This migration adds a generated text column next to every wall-clock
-- timestamp the admin reads in the dashboard. The column is computed by
-- Postgres from the underlying timestamptz, formatted in Asia/Kolkata:
--
--   bookings.start_ts            (timestamptz, UTC)   2026-05-19 08:30:00+00
--   bookings.start_ts_ist        (text, generated)    2026-05-19 14:00 IST
--
-- Pros
--   • Zero app-code change. Reads automatically include the column.
--   • One source of truth — the timestamptz. The IST column can never drift
--     because it's STORED GENERATED — Postgres recomputes on every update.
--   • Visible in Supabase dashboard, psql, pg_dump, downstream tools.
--
-- Cost
--   • ~25 bytes per row per column (text). Trivial at our row counts.
--   • No new indexes — these are display-only.
--
-- ROLLOUT
-- All columns are IF NOT EXISTS, so reruns are no-ops. Safe to apply against
-- a populated database. No data migration needed — STORED generated columns
-- are backfilled by Postgres in a single pass at ALTER TIME.

-- Helper macro: format "YYYY-MM-DD HH24:MI IST" in Asia/Kolkata.
-- Inlined per column because Postgres doesn't allow function calls in
-- generated-column expressions unless the function is IMMUTABLE, and
-- `AT TIME ZONE` with a literal string already meets that bar.

-- ── bookings ──────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS start_ts_ist  text GENERATED ALWAYS AS
    (to_char(start_ts  AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS end_ts_ist    text GENERATED ALWAYS AS
    (to_char(end_ts    AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS created_at_ist text GENERATED ALWAYS AS
    (to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS picked_up_at_ist text GENERATED ALWAYS AS
    (CASE WHEN picked_up_at IS NULL THEN NULL
          ELSE to_char(picked_up_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS returned_at_ist text GENERATED ALWAYS AS
    (CASE WHEN returned_at IS NULL THEN NULL
          ELSE to_char(returned_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS cancelled_at_ist text GENERATED ALWAYS AS
    (CASE WHEN cancelled_at IS NULL THEN NULL
          ELSE to_char(cancelled_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED;

COMMENT ON COLUMN bookings.start_ts_ist IS
  'Display copy of start_ts in Asia/Kolkata. Generated column — do not write to it directly. Source of truth is start_ts (timestamptz, UTC).';

-- ── bikes ─────────────────────────────────────────────────────────────────
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS frozen_from_ist text GENERATED ALWAYS AS
    (CASE WHEN frozen_from IS NULL THEN NULL
          ELSE to_char(frozen_from AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS frozen_until_ist text GENERATED ALWAYS AS
    (CASE WHEN frozen_until IS NULL THEN NULL
          ELSE to_char(frozen_until AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS created_at_ist text GENERATED ALWAYS AS
    (to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS updated_at_ist text GENERATED ALWAYS AS
    (to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED;

COMMENT ON COLUMN bikes.frozen_from_ist IS
  'Display copy of frozen_from in Asia/Kolkata. Read-only generated column.';

-- ── coupons ───────────────────────────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS active_from_ist text GENERATED ALWAYS AS
    (CASE WHEN active_from IS NULL THEN NULL
          ELSE to_char(active_from AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS expires_at_ist text GENERATED ALWAYS AS
    (CASE WHEN expires_at IS NULL THEN NULL
          ELSE to_char(expires_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS created_at_ist text GENERATED ALWAYS AS
    (to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED;

-- ── users ─────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at_ist text GENERATED ALWAYS AS
    (to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at_ist text GENERATED ALWAYS AS
    (CASE WHEN kyc_submitted_at IS NULL THEN NULL
          ELSE to_char(kyc_submitted_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at_ist text GENERATED ALWAYS AS
    (CASE WHEN kyc_reviewed_at IS NULL THEN NULL
          ELSE to_char(kyc_reviewed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED;

-- ── booking_extensions ────────────────────────────────────────────────────
ALTER TABLE booking_extensions
  ADD COLUMN IF NOT EXISTS original_end_ts_ist text GENERATED ALWAYS AS
    (to_char(original_end_ts AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS new_end_ts_ist text GENERATED ALWAYS AS
    (to_char(new_end_ts AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS created_at_ist text GENERATED ALWAYS AS
    (to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS expires_at_ist text GENERATED ALWAYS AS
    (to_char(expires_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST') STORED,
  ADD COLUMN IF NOT EXISTS paid_at_ist text GENERATED ALWAYS AS
    (CASE WHEN paid_at IS NULL THEN NULL
          ELSE to_char(paid_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
     END) STORED;

DO $$ BEGIN
  RAISE NOTICE 'IST display columns added. Look in Supabase dashboard for *_ist next to each timestamp column.';
END $$;
