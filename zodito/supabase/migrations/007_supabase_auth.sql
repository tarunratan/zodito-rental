-- ============================================================================
-- 007: Migrate from Clerk to Supabase Auth
-- ============================================================================
-- Renames clerk_id -> auth_id (stores Supabase auth.users UUID).
-- Updates all RLS helper functions to use auth.uid() instead of
-- auth.jwt()->>'sub' so they work natively with Supabase Auth.
-- ============================================================================

-- 1. Rename the column
ALTER TABLE users RENAME COLUMN clerk_id TO auth_id;

-- Drop old index, create new one
DROP INDEX IF EXISTS idx_users_clerk_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- 2. Update RLS helper functions to use auth.uid()
--    SECURITY DEFINER so they bypass RLS when querying users table (no recursion)

CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM users WHERE auth_id = auth.uid()::text),
    false
  )
$$;

CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION auth_vendor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id FROM vendors v
    JOIN users u ON u.id = v.user_id
   WHERE u.auth_id = auth.uid()::text
     AND v.status = 'approved'
$$;

CREATE OR REPLACE FUNCTION auth_current_user()
RETURNS users LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM users WHERE auth_id = auth.uid()::text
$$;

-- 3. Update RLS policies that referenced clerk_id directly
DROP POLICY IF EXISTS users_self_read   ON users;
DROP POLICY IF EXISTS users_self_update ON users;
DROP POLICY IF EXISTS users_admin_all   ON users;

CREATE POLICY users_self_read ON users
  FOR SELECT USING (auth_id = auth.uid()::text OR auth_is_admin());

CREATE POLICY users_self_update ON users
  FOR UPDATE USING (auth_id = auth.uid()::text);

CREATE POLICY users_admin_all ON users
  FOR ALL USING (auth_is_admin());
