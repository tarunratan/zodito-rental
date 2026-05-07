-- Add is_public flag to coupons so customers can discover them in booking flow
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_public bool NOT NULL DEFAULT false;
