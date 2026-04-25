-- ============================================================================
-- 011: Comprehensive fix — run this once in Supabase SQL Editor
-- ============================================================================

-- 1. Rename clerk_id → auth_id (safe if already done)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'clerk_id'
  ) THEN
    ALTER TABLE users RENAME COLUMN clerk_id TO auth_id;
    DROP INDEX IF EXISTS idx_users_clerk_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
  END IF;
END $$;

-- 2. Drop the trigger that is breaking signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- 3. Recreate RLS helper functions (auth_id-based)
CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM users WHERE auth_id = auth.uid()::text), false)
$$;

CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION auth_vendor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id FROM vendors v
    JOIN users u ON u.id = v.user_id
   WHERE u.auth_id = auth.uid()::text AND v.status = 'approved'
$$;

-- 4. Reset and recreate users RLS policies
DROP POLICY IF EXISTS users_self_read   ON users;
DROP POLICY IF EXISTS users_self_insert ON users;
DROP POLICY IF EXISTS users_self_update ON users;
DROP POLICY IF EXISTS users_admin_all   ON users;

CREATE POLICY users_self_read   ON users FOR SELECT USING (auth_id = auth.uid()::text OR auth_is_admin());
CREATE POLICY users_self_insert ON users FOR INSERT WITH CHECK (auth_id = auth.uid()::text);
CREATE POLICY users_self_update ON users FOR UPDATE USING (auth_id = auth.uid()::text);
CREATE POLICY users_admin_all   ON users FOR ALL USING (auth_is_admin());

-- 5. Confirm all existing unconfirmed auth users so they can sign in
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()), updated_at = NOW()
WHERE email_confirmed_at IS NULL;
