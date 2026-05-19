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
      setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => {
        try {
          // Works in route handlers; throws (and is caught) in server components
          cookiesToSet.forEach(({ name, value, options }) =>
            (cookieStore as any).set(name, value, options)
          );
        } catch {
          // Called from a server component — middleware handles token refresh
        }
      },
    },
  });
}

export function createSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    return new Proxy({} as any, {
      get() {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — check Vercel env vars');
      },
    });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Like createSupabaseAdmin, but every inner GET to PostgREST passes through
 * `fetch(..., { cache: 'no-store' })`. Use for diagnostic/realtime endpoints
 * where Next.js 14's default GET-fetch cache would silently serve a stale
 * row long after the underlying DB changed.
 *
 * Concrete failure mode this prevents: a polling debug overlay opened before
 * the admin edits a bike will keep returning the pre-edit row forever,
 * because the Next fetch cache was populated on the first poll and the
 * route's `dynamic = 'force-dynamic'` does NOT propagate to inner fetches.
 */
export function createSupabaseAdminFresh() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    return new Proxy({} as any, {
      get() {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — check Vercel env vars');
      },
    });
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (url, init) => fetch(url as any, { ...(init ?? {}), cache: 'no-store' as RequestCache }),
    },
  });
}
