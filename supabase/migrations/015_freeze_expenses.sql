-- ============================================================================
-- BIKE FREEZE (maintenance windows) + EXPENSES TRACKING
-- ============================================================================

-- Add freeze columns to bikes
alter table bikes
  add column if not exists frozen_from timestamptz,
  add column if not exists frozen_until timestamptz,
  add column if not exists freeze_reason text;

create index if not exists idx_bikes_frozen on bikes(frozen_until)
  where frozen_until is not null;

-- ============================================================================
-- BIKE EXPENSES
-- ============================================================================

create type expense_category as enum (
  'tyre', 'maintenance', 'repair', 'insurance',
  'fuel', 'cleaning', 'parts', 'other'
);

create table bike_expenses (
  id uuid primary key default uuid_generate_v4(),
  bike_id uuid not null references bikes(id) on delete cascade,
  recorded_by uuid references users(id),
  category expense_category not null default 'other',
  description text not null,
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  receipt_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bike_expenses_bike_id on bike_expenses(bike_id);
create index idx_bike_expenses_date on bike_expenses(expense_date);
create index idx_bike_expenses_category on bike_expenses(category);

create trigger trg_bike_expenses_updated before update on bike_expenses
  for each row execute function set_updated_at();

-- RLS
alter table bike_expenses enable row level security;

create policy "Admin full access to bike_expenses" on bike_expenses
  for all using (
    exists (select 1 from users where auth_id = auth.uid()::text and role = 'admin')
  );

create policy "Vendor read own bike expenses" on bike_expenses
  for select using (
    exists (
      select 1 from bikes b
      join vendors v on b.vendor_id = v.id
      join users u on v.user_id = u.id
      where b.id = bike_expenses.bike_id
        and u.auth_id = auth.uid()::text
    )
  );
