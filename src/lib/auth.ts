import { createSupabaseServer, createSupabaseAdmin } from './supabase/server';
import { isMockMode, MOCK_USER } from './mock';
import type { User } from './supabase/types';

export async function getCurrentAppUser(): Promise<User | null> {
  if (isMockMode()) return MOCK_USER as User;

  try {
    const supabase = await createSupabaseServer();

    // Verify session with Supabase Auth
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    // Read own users-table row — user's session satisfies the self-read RLS policy
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .maybeSingle();

    if (existing) return existing as User;

    // No row yet (first login after account creation) — create it.
    // INSERT policy allows users to insert their own row.
    const { data: created } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: authUser.email ?? null,
        phone: authUser.user_metadata?.phone ?? null,
        first_name: authUser.user_metadata?.first_name ?? null,
        last_name: authUser.user_metadata?.last_name ?? null,
        role: 'customer',
      })
      .select('*')
      .single();

    return (created as User) ?? null;
  } catch (err) {
    console.error('[auth] getCurrentAppUser error:', err);
    return null;
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
