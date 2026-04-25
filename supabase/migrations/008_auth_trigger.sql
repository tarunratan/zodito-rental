-- ============================================================================
-- 008: Auto-create public.users row on Supabase Auth signup
-- ============================================================================
-- Runs on INSERT to auth.users so every new signup immediately has a row
-- in public.users. This is a safety net — the API route also inserts the row,
-- but the trigger covers any edge cases (OAuth, admin-created users, etc).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, first_name, last_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    'customer'
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
