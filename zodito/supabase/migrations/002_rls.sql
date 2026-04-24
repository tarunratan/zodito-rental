-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- We identify the current user via the JWT 'sub' claim set by Clerk.
-- The Supabase JWT template (configured in Clerk) forwards Clerk's user ID
-- as the 'sub' claim; we look it up in our users table to get role.
--
-- Pattern: most queries hit our API routes using the SERVICE ROLE key
-- (which bypasses RLS). RLS here is a defense-in-depth layer in case anyone
-- ever uses the ANON key directly from the browser.
-- ============================================================================

-- Helper: get current user's row from Clerk JWT
create or replace function auth_current_user()
returns users language sql stable as $$
  select * from users where clerk_id = (auth.jwt() ->> 'sub')
$$;

-- Helper: is current user an admin?
create or replace function auth_is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (select role = 'admin' from users where clerk_id = (auth.jwt() ->> 'sub')),
    false
  )
$$;

-- Helper: get current user's DB id
create or replace function auth_user_id()
returns uuid language sql stable as $$
  select id from users where clerk_id = (auth.jwt() ->> 'sub')
$$;

-- Helper: is current user a vendor, and if so return vendor id
create or replace function auth_vendor_id()
returns uuid language sql stable as $$
  select v.id from vendors v
    join users u on u.id = v.user_id
   where u.clerk_id = (auth.jwt() ->> 'sub')
     and v.status = 'approved'
$$;

-- ---- USERS ----
alter table users enable row level security;

create policy users_self_read on users
  for select using (clerk_id = (auth.jwt() ->> 'sub') or auth_is_admin());

create policy users_self_update on users
  for update using (clerk_id = (auth.jwt() ->> 'sub'));

create policy users_admin_all on users
  for all using (auth_is_admin());

-- ---- VENDORS ----
alter table vendors enable row level security;

-- Vendors see their own row; admins see all
create policy vendors_self_read on vendors
  for select using (
    user_id = auth_user_id() or auth_is_admin()
  );

create policy vendors_self_update on vendors
  for update using (user_id = auth_user_id());

create policy vendors_admin_all on vendors
  for all using (auth_is_admin());

-- Anyone can create their own vendor application
create policy vendors_insert_self on vendors
  for insert with check (user_id = auth_user_id());

-- ---- BIKE MODELS & PACKAGES (public read) ----
alter table bike_models enable row level security;
alter table bike_model_packages enable row level security;

create policy bike_models_public_read on bike_models for select using (true);
create policy bike_models_admin_write on bike_models for all using (auth_is_admin());
create policy bmp_public_read on bike_model_packages for select using (true);
create policy bmp_admin_write on bike_model_packages for all using (auth_is_admin());

-- ---- BIKES ----
alter table bikes enable row level security;

-- Public can read approved + active bikes
create policy bikes_public_read on bikes for select
  using (listing_status = 'approved' and is_active = true);

-- Vendor can read/write their own bikes
create policy bikes_vendor_own on bikes for all using (
  vendor_id = auth_vendor_id()
) with check (
  vendor_id = auth_vendor_id()
);

-- Admin full access
create policy bikes_admin_all on bikes for all using (auth_is_admin());

-- ---- BOOKINGS ----
alter table bookings enable row level security;

-- Customer sees their own bookings
create policy bookings_customer_read on bookings for select
  using (user_id = auth_user_id());

-- Vendor sees bookings for their bikes
create policy bookings_vendor_read on bookings for select using (
  exists (
    select 1 from bikes b
     where b.id = bookings.bike_id
       and b.vendor_id = auth_vendor_id()
  )
);

-- Admin sees all
create policy bookings_admin_all on bookings for all using (auth_is_admin());

-- Customer can insert their own booking
create policy bookings_customer_insert on bookings for insert
  with check (user_id = auth_user_id());

-- ---- WEBHOOK EVENTS (admin only; API routes use service role) ----
alter table webhook_events enable row level security;
create policy webhook_admin on webhook_events for all using (auth_is_admin());
