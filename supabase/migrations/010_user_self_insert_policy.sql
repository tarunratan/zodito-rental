-- ============================================================================
-- 010: Allow users to insert their own row in public.users
-- ============================================================================
-- Needed as a fallback when the auth trigger (008) doesn't fire and the
-- admin client isn't available. With this policy, the server can insert
-- the users row using the user's own Supabase session.
-- ============================================================================

DROP POLICY IF EXISTS users_self_insert ON users;

CREATE POLICY users_self_insert ON users
  FOR INSERT
  WITH CHECK (auth_id = auth.uid()::text);
