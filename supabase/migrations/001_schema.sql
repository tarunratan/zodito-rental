-- ============================================================================
-- ZODITO RENTALS - CORE SCHEMA
-- ============================================================================
-- Run this first in Supabase SQL Editor.
-- Then run 002_rls.sql, then 003_master_pricing.sql, then 004_functions.sql.
-- ============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "btree_gist";  -- needed for exclusion constraint

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('customer', 'vendor', 'admin');

create type kyc_status as enum ('not_submitted', 'pending', 'approved', 'rejected');

create type vendor_status as enum ('pending', 'approved', 'rejected', 'suspended');

create type bike_owner_type as enum ('platform', 'vendor');  -- platform = Zodito's own fleet

create type bike_category as enum ('scooter', 'bike_sub150', 'bike_plus150');
-- scooter = <=110cc, bike_sub150 = 125-150, bike_plus150 = 151+

create type bike_listing_status as enum ('draft', 'pending_approval', 'approved', 'rejected', 'inactive');

create type package_tier as enum ('12hr', '24hr', '7day', '15day', '30day');

create type booking_status as enum (
  'pending_payment',  -- created, awaiting razorpay
  'confirmed',        -- paid, ready for pickup
  'ongoing',          -- customer picked up
  'completed',        -- returned
  'cancelled',        -- cancelled by user or admin
  'payment_failed'    -- payment timed out / failed, admin will review
);

create type payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');

-- ============================================================================
-- USERS (synced from Clerk via webhook)
-- ============================================================================

create table users (
  id uuid primary key default uuid_generate_v4(),
  clerk_id text unique not null,          -- Clerk's user ID
  email text,
  phone text,
  first_name text,
  last_name text,
  role user_role not null default 'customer',

  -- KYC fields (for customers)
  kyc_status kyc_status not null default 'not_submitted',
  dl_number text,
  dl_photo_url text,              -- Supabase Storage path
  aadhaar_photo_url text,
  kyc_submitted_at timestamptz,
  kyc_reviewed_at timestamptz,
  kyc_reviewed_by uuid,
  kyc_rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_clerk_id on users(clerk_id);
create index idx_users_role on users(role);
create index idx_users_kyc_status on users(kyc_status) where kyc_status in ('pending', 'rejected');

-- ============================================================================
-- VENDORS
-- ============================================================================

create table vendors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,

  business_name text not null,
  contact_phone text not null,
  contact_email text,

  -- Pickup location shown to customers
  pickup_address text not null,         -- Full address (only shown post-payment)
  pickup_area text not null,            -- Area/locality (shown on bike card pre-payment)
  pickup_lat numeric(10, 7),
  pickup_lng numeric(10, 7),

  -- Payout details (for future automation; manual payouts in v1)
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,

  commission_pct numeric(5, 2) not null default 20.00,  -- Zodito's cut; 20% default

  status vendor_status not null default 'pending',
  approval_notes text,
  approved_at timestamptz,
  approved_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vendors_status on vendors(status);
create index idx_vendors_user_id on vendors(user_id);

-- ============================================================================
-- MASTER PRICING
-- ============================================================================
-- This is the price list from your screenshot.
-- Any bike (platform OR vendor) references a master model to get its pricing.
-- Vendors can't set their own prices; they just pick a model.

create table bike_models (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,                -- 'Activa 6G', 'R15v4', etc.
  display_name text not null,               -- Shown to users
  category bike_category not null,
  cc int not null,
  excess_km_rate numeric(10, 2) not null,   -- ₹ per km over limit
  late_hourly_penalty numeric(10, 2) not null,  -- ₹ per hour late
  -- If true, weekend prices override with the 'weekend_override_model_id' prices.
  -- Used for Activa 4G/5G → priced same as Activa 6G on weekends.
  has_weekend_override boolean not null default false,
  weekend_override_model_id uuid references bike_models(id),
  created_at timestamptz not null default now()
);

create table bike_model_packages (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references bike_models(id) on delete cascade,
  tier package_tier not null,
  price numeric(10, 2) not null,
  km_limit int not null,
  unique (model_id, tier)
);

create index idx_bmp_model_id on bike_model_packages(model_id);

-- ============================================================================
-- BIKES (individual bike inventory; platform-owned OR vendor-owned)
-- ============================================================================

create table bikes (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references bike_models(id),

  owner_type bike_owner_type not null,
  vendor_id uuid references vendors(id) on delete cascade,
  -- CHECK: if owner_type='vendor' then vendor_id NOT NULL; if 'platform' then NULL
  constraint chk_bike_ownership check (
    (owner_type = 'platform' and vendor_id is null) or
    (owner_type = 'vendor' and vendor_id is not null)
  ),

  -- Individual bike attributes
  registration_number text unique,      -- e.g. 'TS 09 EC 1234'
  color text,
  color_hex text,                        -- for the dot on the card
  year int,
  image_url text,                        -- Supabase Storage URL
  image_url_2 text,
  image_url_3 text,
  emoji text default '🏍️',              -- fallback icon

  listing_status bike_listing_status not null default 'draft',
  is_active boolean not null default true,    -- admin can toggle off w/o deleting
  rejection_reason text,
  approved_at timestamptz,
  approved_by uuid references users(id),

  total_rides int not null default 0,
  rating_avg numeric(3, 2) default 0,
  rating_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bikes_owner_type on bikes(owner_type);
create index idx_bikes_vendor_id on bikes(vendor_id);
create index idx_bikes_listing_status on bikes(listing_status);
create index idx_bikes_model_id on bikes(model_id);
create index idx_bikes_active_approved on bikes(is_active, listing_status)
  where is_active = true and listing_status = 'approved';

-- ============================================================================
-- BOOKINGS
-- ============================================================================

create table bookings (
  id uuid primary key default uuid_generate_v4(),
  booking_number text unique not null default ('ZD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0')),

  user_id uuid not null references users(id),
  bike_id uuid not null references bikes(id),

  -- Period of rental
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  constraint chk_booking_time check (end_ts > start_ts),

  -- Pricing snapshot (captured at booking time so later price changes don't affect past bookings)
  package_tier package_tier not null,
  base_price numeric(10, 2) not null,
  km_limit int not null,

  -- Add-ons
  extra_helmet_count int not null default 0,
  extra_helmet_price numeric(10, 2) not null default 0,

  -- Security deposit (₹500 normal, ₹1000 if no original DL — admin handles at pickup)
  security_deposit numeric(10, 2) not null default 500,

  -- Taxes
  subtotal numeric(10, 2) not null,
  gst_amount numeric(10, 2) not null,

  -- Final total (what customer pays via Razorpay)
  total_amount numeric(10, 2) not null,

  -- Commission tracking (for vendor bookings)
  platform_commission numeric(10, 2) not null default 0,
  vendor_payout numeric(10, 2) not null default 0,

  status booking_status not null default 'pending_payment',
  payment_status payment_status not null default 'pending',

  -- Auto-cancel deadline (10 min after creation if unpaid)
  payment_deadline timestamptz not null default (now() + interval '10 minutes'),

  -- Razorpay refs
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,

  -- Pickup-time verification (admin/vendor marks these at handover)
  dl_verified_at timestamptz,
  aadhaar_received_at timestamptz,
  had_original_dl boolean,              -- if false, extra ₹500 deposit applied
  picked_up_at timestamptz,
  returned_at timestamptz,

  -- Post-return
  final_km_used int,
  excess_km_charge numeric(10, 2) default 0,
  late_hours int default 0,
  late_charge numeric(10, 2) default 0,
  damage_charge numeric(10, 2) default 0,
  deposit_refunded_amount numeric(10, 2),
  deposit_refunded_at timestamptz,

  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references users(id),

  notes text,                           -- admin notes

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_user_id on bookings(user_id);
create index idx_bookings_bike_id on bookings(bike_id);
create index idx_bookings_status on bookings(status);
create index idx_bookings_start_ts on bookings(start_ts);
create index idx_bookings_payment_deadline on bookings(payment_deadline)
  where status = 'pending_payment';

-- ─── THE CRITICAL CONSTRAINT ───
-- Prevents two overlapping ACTIVE bookings on the same bike.
-- Uses Postgres GIST exclusion constraint — enforced atomically by the DB itself,
-- so even with concurrent requests hitting our API at the same millisecond,
-- only one will win. No race conditions possible.
alter table bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    bike_id with =,
    tstzrange(start_ts, end_ts, '[)') with &&
  )
  where (status in ('pending_payment', 'confirmed', 'ongoing'));

-- ============================================================================
-- WEBHOOK EVENTS (idempotency log for Razorpay webhooks)
-- ============================================================================

create table webhook_events (
  id uuid primary key default uuid_generate_v4(),
  source text not null,                 -- 'razorpay' | 'clerk'
  event_id text not null,
  event_type text,
  payload jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (source, event_id)
);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();
create trigger trg_vendors_updated before update on vendors
  for each row execute function set_updated_at();
create trigger trg_bikes_updated before update on bikes
  for each row execute function set_updated_at();
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();
