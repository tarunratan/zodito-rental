import { auth, currentUser } from '@clerk/nextjs/server';
import { createSupabaseAdmin } from './supabase/server';
import { isMockMode, MOCK_USER, hasClerkKeys } from './mock';
import type { User } from './supabase/types';

/**
 * Get the current app user (from our users table, not Clerk's).
 * In mock mode: returns MOCK_USER.
 * Otherwise: returns null if not signed in, or the user row from DB.
 */
export async function getCurrentAppUser(): Promise<User | null> {
  if (isMockMode() || !hasClerkKeys()) {
    return MOCK_USER as User;
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

    const { data: inserted } = await supabase
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
