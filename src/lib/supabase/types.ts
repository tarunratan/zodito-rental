// ============================================================================
// DATABASE TYPES
// ============================================================================
// Mirrors the types from 001_schema.sql. In a larger project you'd generate
// these with `supabase gen types typescript` — for now, hand-written is fine.
// ============================================================================

export type UserRole = 'customer' | 'vendor' | 'admin';
export type KycStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';
export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BikeOwnerType = 'platform' | 'vendor';
export type BikeCategory = 'scooter' | 'bike_sub125' | 'bike_sub150' | 'bike_plus150';
export type BikeListingStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'inactive';
export type PackageTier = '12hr' | '24hr' | '7day' | '15day' | '30day';
export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'ongoing'
  | 'completed'
  | 'cancelled'
  | 'payment_failed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';

export interface User {
  id: string;
  auth_id: string;          // Supabase auth.users UUID
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  kyc_status: KycStatus;
  dl_number: string | null;
  dl_photo_url: string | null;
  aadhaar_photo_url: string | null;
  selfie_with_dl_photo_url: string | null;
  kyc_rejection_reason: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  user_id: string;
  business_name: string;
  contact_phone: string;
  contact_email: string | null;
  pickup_address: string;
  pickup_area: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  commission_pct: number;
  status: VendorStatus;
  approval_notes: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BikeModel {
  id: string;
  name: string;
  display_name: string;
  category: BikeCategory;
  cc: number;
  excess_km_rate: number;
  late_hourly_penalty: number;
  has_weekend_override: boolean;
  weekend_override_model_id: string | null;
  created_at: string;
}

export interface BikeModelPackage {
  id: string;
  model_id: string;
  tier: PackageTier;
  price: number;
  km_limit: number;
}

export interface Bike {
  id: string;
  model_id: string;
  owner_type: BikeOwnerType;
  vendor_id: string | null;
  registration_number: string | null;
  color: string | null;
  color_hex: string | null;
  year: number | null;
  image_url: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  emoji: string;
  listing_status: BikeListingStatus;
  is_active: boolean;
  rejection_reason: string | null;
  total_rides: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

// Convenience shape when joining bike + model + packages + vendor
export interface BikeWithDetails extends Bike {
  model: BikeModel & { packages: BikeModelPackage[] };
  vendor?: Pick<Vendor, 'id' | 'business_name' | 'pickup_area'> | null;
}

export interface Booking {
  id: string;
  booking_number: string;
  user_id: string;
  bike_id: string;
  start_ts: string;
  end_ts: string;
  package_tier: PackageTier;
  base_price: number;
  km_limit: number;
  extra_helmet_count: number;
  extra_helmet_price: number;
  security_deposit: number;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  platform_commission: number;
  vendor_payout: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_deadline: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
}
