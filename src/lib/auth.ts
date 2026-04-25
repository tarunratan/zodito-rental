import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { createSupabaseAdmin } from './supabase/server';
import { isMockMode, MOCK_USER, hasClerkKeys, getMockRoleFromCookies } from './mock';
import type { User } from './supabase/types';

/**
 * Get the current app user (from our users table, not Clerk's).
 * In mock mode: returns MOCK_USER with role override from `mock_role` cookie.
 * Otherwise: returns null if not signed in, or the user row from DB.
 */
export async function getCurrentAppUser(): Promise<User | null> {
  if (isMockMode() || !hasClerkKeys()) {
    // Read role from cookie so we can "impersonate" customer/vendor/admin in dev
    let role: 'customer' | 'vendor' | 'admin' = 'customer';
    try {
      const store = cookies();
      const c = store.get('mock_role')?.value;
      if (c === 'customer' || c === 'vendor' || c === 'admin') role = c;
    } catch {
      // cookies() throws outside request scope; default to customer
    }
    return { ...MOCK_USER, role } as User;
  }

  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', userId)
    .maybeSingle();

  // Fallback: if the row somehow doesn't exist yet, create it on-the-fly
  // (covers edge cases where the webhook hasn't fired yet).
  if (!data) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const { data: inserted, error: insertErr } = await supabase
      .from('users')
      .insert({
        clerk_id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
        phone: clerkUser.phoneNumbers[0]?.phoneNumber ?? null,
        first_name: clerkUser.firstName,
        last_name: clerkUser.lastName,
        role: 'customer',
      })
      .select('*')
      .single();

    if (insertErr) {
      // Insert may fail with a duplicate key if the webhook raced us — refetch.
      console.error('[auth] on-the-fly user insert failed:', insertErr.message);
      const { data: refetched } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_id', userId)
        .maybeSingle();
      return refetched as User | null;
    }

    return inserted as User | null;
  }

  return data as User;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') {
    throw new Error('admin access required');
  }
  return user;
}

export async function requireVendor(): Promise<User> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'vendor' && user.role !== 'admin')) {
    throw new Error('vendor access required');
  }
  return user;
}
