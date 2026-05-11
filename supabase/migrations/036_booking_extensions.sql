-- ============================================================================
-- BOOKING EXTENSIONS
-- ----------------------------------------------------------------------------
-- Captures customer-initiated extensions of an ongoing booking, payment-first.
--
-- Lifecycle:
--   pending_payment → confirmed   (after successful Razorpay payment)
--   pending_payment → failed      (payment failed / dismissed)
--   pending_payment → expired     (15-min reservation window elapsed unpaid)
--
-- The booking's `end_ts` and `km_limit` are ONLY mutated when an extension
-- transitions to `confirmed`. A failed/expired extension leaves the original
-- booking untouched.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'extension_status') then
    create type extension_status as enum ('pending_payment', 'confirmed', 'failed', 'expired');
  end if;
end $$;

create table if not exists booking_extensions (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid not null references bookings(id) on delete cascade,
  user_id             uuid not null references users(id),

  status              extension_status not null default 'pending_payment',

  -- Time delta — original_end_ts is captured at create time so we can detect
  -- if the booking moved underneath us before the payment cleared.
  original_end_ts     timestamptz not null,
  new_end_ts          timestamptz not null,
  extra_hours         numeric(8,2) not null,

  -- KM delta
  original_km_limit   int not null,
  extra_km            int not null default 0,
  new_km_limit        int not null,

  -- Financials (₹). Stored as cumulative new-trip price minus old-trip price,
  -- which makes the extension transparent across tier-bracket changes.
  base_delta          numeric(10,2) not null,
  gst_delta           numeric(10,2) not null,
  total_delta         numeric(10,2) not null,

  -- Which bracket the EXTENDED trip resolved to (standard tier or custom pkg)
  matched_tier        text,
  custom_package_id   uuid references custom_packages(id) on delete set null,

  razorpay_order_id   text,
  razorpay_payment_id text,

  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  expires_at          timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists idx_booking_extensions_booking on booking_extensions(booking_id, created_at desc);
create index if not exists idx_booking_extensions_status_expires on booking_extensions(status, expires_at);

alter table booking_extensions enable row level security;

create policy "Users read own extensions" on booking_extensions
  for select using (user_id = (select id from users where auth_id = auth.uid()::text));

create policy "Admin full access to extensions" on booking_extensions
  for all using (
    exists (select 1 from users where auth_id = auth.uid()::text and role = 'admin')
  );
