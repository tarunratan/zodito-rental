-- ============================================================================
-- 013: Allow customers to read vendor info for their own bookings
-- ============================================================================
-- The vendors_self_read policy only allows a vendor to read their own row.
-- Customers need to see the vendor's pickup location/contact for bikes
-- they've booked, so we add a scoped read policy.
-- ============================================================================

DROP POLICY IF EXISTS vendors_customer_booking_read ON vendors;

CREATE POLICY vendors_customer_booking_read ON vendors
  FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT b.vendor_id
        FROM bikes b
        JOIN bookings bk ON bk.bike_id = b.id
       WHERE bk.user_id = auth_user_id()
         AND b.vendor_id IS NOT NULL
    )
  );
