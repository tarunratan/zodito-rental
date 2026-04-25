import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function createSupabaseServer() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => { /* no-op in server components */ },
    },
  });
}

/**
 * Admin client that bypasses RLS. USE ONLY in trusted server code
 * (API routes, webhooks). Never expose to the browser.
 *
 * In mock mode (no Supabase env), returns a stub that throws clearly if used —
 * callers should check isMockMode() before calling.
 */
export function createSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    // Return a typed shim so callers that accidentally use it get a helpful error.
    return new Proxy({} as any, {
      get() {
        throw new Error(
          'Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, ' +
          'or guard the call with isMockMode() first.'
        );
      },
    });
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
