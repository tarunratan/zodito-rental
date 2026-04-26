-- ============================================================================
-- COUPONS
-- ============================================================================

create type coupon_discount_type as enum ('percent', 'fixed', 'gst_waiver');

create table coupons (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,             -- e.g. NOGST, WELCOME10
  label text not null,                   -- human name shown in admin
  discount_type coupon_discount_type not null default 'percent',
  discount_value numeric(10,2) not null default 0,  -- ignored for gst_waiver
  max_uses integer,                      -- null = unlimited
  used_count integer not null default 0,
  expires_at timestamptz,                -- null = never
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table coupon_uses (
  id uuid primary key default uuid_generate_v4(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  user_id uuid not null references users(id),
  booking_id uuid references bookings(id),
  discount_amount numeric(10,2) not null default 0,
  used_at timestamptz not null default now()
);

-- Add coupon tracking to bookings
alter table bookings
  add column coupon_id uuid references coupons(id),
  add column coupon_code text,
  add column coupon_discount numeric(10,2) not null default 0;

-- RLS
alter table coupons enable row level security;
alter table coupon_uses enable row level security;

-- All authenticated users can read active coupons (needed for validate API via anon client)
-- But we use admin client in API routes so this is mainly for direct queries
create policy "Active coupons readable by all" on coupons
  for select using (is_active = true);

create policy "Admin full access to coupons" on coupons
  for all using (
    exists (select 1 from users where clerk_id = (auth.jwt() ->> 'sub') and role = 'admin')
  );

create policy "Users read own coupon uses" on coupon_uses
  for select using (
    user_id = (select id from users where clerk_id = (auth.jwt() ->> 'sub'))
  );

-- Helper function to safely increment used_count
create or replace function increment_coupon_used_count(p_coupon_id uuid)
returns void language sql security definer as $$
  update coupons set used_count = used_count + 1 where id = p_coupon_id;
$$;
