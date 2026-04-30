-- Migration 022: Add client IP capture to bookings (server-side fallback for GPS)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_ip text;
