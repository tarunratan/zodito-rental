-- Per-bike extra KM rate and late-return penalty, with sensible defaults
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS extra_km_rate     NUMERIC(8,2) DEFAULT 3   NOT NULL,
  ADD COLUMN IF NOT EXISTS late_penalty_hour NUMERIC(8,2) DEFAULT 49  NOT NULL;
