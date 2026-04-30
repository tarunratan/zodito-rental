-- Migration 021: Capture booking geolocation (best-effort, nullable)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_lat double precision,
  ADD COLUMN IF NOT EXISTS booking_lng double precision;
