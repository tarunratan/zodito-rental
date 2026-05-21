/**
 * Email existence check — used by the signup form (refuse to register a
 * duplicate) and forgot-password (catch typos before sending an OTP that
 * would silently no-op for an unknown email).
 *
 * Implementation note: we query `auth.users` via the admin client. Supabase's
 * default behavior on signup with an existing email is to return a successful
 * response but skip the email send (anti-enumeration). That UX is confusing
 * for our users (they sit waiting for a code that never arrives), so we trade
 * a small enumeration risk for clear messaging. Rate-limit handled at the
 * Vercel/Supabase edge level — this endpoint is read-only and idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  // Belt-and-braces: this endpoint MUST NEVER throw / crash because both the
  // signup form and forgot-password do a pre-flight call here. A 500 with no
  // body surfaces in the browser as "Failed to fetch" and tanks the whole
  // flow. Always return JSON 200 with a sensible default.
  try {
    const body = await req.json().catch(() => null);
    const parse = schema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ exists: false, source: 'invalid' });
    }
    const email = parse.data.email.trim().toLowerCase();
    if (!email) return NextResponse.json({ exists: false, source: 'empty' });

    const supabase = createSupabaseAdmin();

    // Only check public.users — it mirrors confirmed accounts (created on
    // first signed-in request). Fast indexed lookup, no admin SDK calls.
    // False-negatives (unconfirmed Supabase auth rows that haven't mirrored
    // over yet) fall through to Supabase's own signUp / resetPassword which
    // handle the duplicate case server-side. The trade-off keeps this
    // endpoint snappy and crash-proof, which matters more than catching
    // every edge case.
    const { data: row, error } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (error) {
      // Don't propagate DB errors to the client — degrade to "unknown" so
      // the user's flow can still proceed via Supabase's server-side checks.
      return NextResponse.json({ exists: false, source: 'unknown' });
    }
    return NextResponse.json({ exists: !!row, source: row ? 'public' : 'public-miss' });
  } catch {
    return NextResponse.json({ exists: false, source: 'error' });
  }
}
