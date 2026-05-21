-- ============================================================================
-- SEQUENTIAL BOOKING NUMBERS — ZR001, ZR002, ZR003 …
-- ----------------------------------------------------------------------------
-- The previous default produced date-based randoms ('ZD' || YYMMDD || rand4).
-- Owner asked for short sequential numbers instead. Existing rows keep their
-- ZD… numbers; only NEW inserts pick up the ZR sequence.
--
-- The sequence runs across both online and offline bookings so admins can
-- read them as a single ledger (#ZR042 = the 42nd booking ever taken).
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS booking_number_seq START 1;

ALTER TABLE bookings
  ALTER COLUMN booking_number SET DEFAULT (
    'ZR' || lpad(nextval('booking_number_seq')::text, 3, '0')
  );

-- Convenience: rotate the sequence past any existing ZR-numbered rows so a
-- fresh DB with imported data doesn't collide. Safe no-op when none exist.
DO $$
DECLARE
  max_zr int;
BEGIN
  SELECT COALESCE(MAX(substring(booking_number FROM 3)::int), 0)
    INTO max_zr
    FROM bookings
   WHERE booking_number ~ '^ZR\d+$';
  IF max_zr > 0 THEN
    PERFORM setval('booking_number_seq', max_zr);
  END IF;
END $$;
