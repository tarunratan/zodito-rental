import { createSupabaseServer, createSupabaseAdmin } from './supabase/server';
import { isMockMode, MOCK_USER } from './mock';
import type { User } from './supabase/types';

export async function getCurrentAppUser(): Promise<User | null> {
  if (isMockMode()) {
    return MOCK_USER as User;
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!data) {
    // On-the-fly create — covers the window between signup and first page load
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

    if (insertErr) {
      console.error('[auth] on-the-fly user insert failed:', insertErr.message);
      const { data: refetched } = await admin
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .maybeSingle();
      return refetched as User | null;
    }

    return inserted as User | null;
  }

  return data as User;
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
