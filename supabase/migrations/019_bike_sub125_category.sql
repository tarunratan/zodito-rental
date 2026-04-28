-- 019: Add bike_sub125 category for bikes under 125cc (100cc, 110cc, etc.)
ALTER TYPE bike_category ADD VALUE IF NOT EXISTS 'bike_sub125';
