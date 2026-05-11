-- ============================================================================
-- HANDOVER AUDIT LOG
-- ----------------------------------------------------------------------------
-- Captures every save / status transition on a booking so admins can audit
-- "who started the ride, with what odometer, when did the details change?"
-- without having to dig through generic application logs.
--
-- `kind` enumerates the high-level event:
--   save     – any edit to handover fields (odometer, helmets, notes, etc.)
--   confirm  – booking marked confirmed
--   start    – ride started (status → ongoing)
--   complete – ride completed
--   cancel   – booking cancelled
--   refund   – payment marked refunded
--
-- `payload` stores the fields that changed (for `save`) or the action context
-- (for the status transitions).
-- ============================================================================

create table if not exists booking_handover_logs (
  id           uuid primary key default uuid_generate_v4(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  admin_id     uuid references users(id) on delete set null,
  admin_name   text,                          -- snapshot at write-time so deleted admins still show up in audit
  kind         text not null check (kind in ('save', 'confirm', 'start', 'complete', 'cancel', 'refund')),
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_booking_handover_logs_booking
  on booking_handover_logs(booking_id, created_at desc);

alter table booking_handover_logs enable row level security;

create policy "Admin read handover logs" on booking_handover_logs
  for select using (
    exists (select 1 from users where auth_id = auth.uid()::text and role = 'admin')
  );

create policy "Admin insert handover logs" on booking_handover_logs
  for insert with check (
    exists (select 1 from users where auth_id = auth.uid()::text and role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- Cheap denormalised columns on `bookings` so the modal can render
-- "Saved 5 min ago by Ravi" without having to round-trip the audit table on
-- every open. The audit table remains the source of truth for full history.
-- ----------------------------------------------------------------------------
alter table bookings
  add column if not exists handover_saved_at timestamptz,
  add column if not exists handover_saved_by uuid references users(id) on delete set null;
