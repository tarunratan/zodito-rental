-- ============================================================================
-- 012: Allow customers to update their own bookings
-- ============================================================================
-- Needed so the booking route (using user session) can write back
-- razorpay_order_id and payment_failed status without the admin client.
-- ============================================================================

DROP POLICY IF EXISTS bookings_customer_update ON bookings;

CREATE POLICY bookings_customer_update ON bookings
  FOR UPDATE
  USING (user_id = auth_user_id());
