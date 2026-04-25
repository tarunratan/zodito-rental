import { createSupabaseServer, createSupabaseAdmin } from './supabase/server';
import { isMockMode, MOCK_USER } from './mock';
import type { User } from './supabase/types';

export async function getCurrentAppUser(): Promise<User | null> {
  if (isMockMode()) return MOCK_USER as User;

  let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  try {
    supabase = await createSupabaseServer();
  } catch {
    return null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Read own row using the user's own session — RLS allows this without admin.
  // This works even when SUPABASE_SERVICE_ROLE_KEY is wrong/missing.
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (data) return data as User;

  // Row missing (e.g. trigger didn't fire) — create it on the fly.
  // Try admin first, fall back to user session with INSERT policy.
  try {
    const admin = createSupabaseAdmin();
    const { data: inserted, error: insertErr } = await admin
      .from('users')
      .insert({
        auth_id: user.id,
        email: user.email ?? null,
        phone: user.user_metadata?.phone ?? null,
        first_name: user.user_metadata?.first_name ?? null,
        last_name: user.user_metadata?.last_name ?? null,
        role: 'customer',
      })
      .select('*')
      .single();

    if (!insertErr && inserted) return inserted as User;

    // Admin insert failed — try with user session (needs INSERT policy in DB)
    const { data: selfInserted } = await supabase
      .from('users')
      .insert({
        auth_id: user.id,
        email: user.email ?? null,
        phone: user.user_metadata?.phone ?? null,
        first_name: user.user_metadata?.first_name ?? null,
        last_name: user.user_metadata?.last_name ?? null,
        role: 'customer',
      })
      .select('*')
      .single();

    return selfInserted as User | null;
  } catch (e) {
    console.error('[auth] user row creation failed:', e);
    // Last resort: refetch in case a concurrent request created the row
    const { data: refetched } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .maybeSingle();
    return refetched as User | null;
  }
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') throw new Error('admin access required');
  return user;
}

export async function requireVendor(): Promise<User> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'vendor' && user.role !== 'admin')) throw new Error('vendor access required');
  return user;
}
