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
  const parse = schema.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  const email = parse.data.email.trim().toLowerCase();

  const supabase = createSupabaseAdmin();

  // Primary check: public.users mirrors confirmed accounts (created on first
  // signed-in request). Fast index lookup, covers the common case.
  const { data: publicRow } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (publicRow) {
    return NextResponse.json({ exists: true, source: 'public' });
  }

  // Fallback: auth.users may have an unconfirmed signup row that hasn't
  // mirrored over yet. `listUsers` with a per-page filter is the SDK's
  // narrowest call — we pull page 1 (max 1000) and scan locally. For a
  // small/medium tenant this is fine; at scale, replace with a Postgres
  // function that does `select 1 from auth.users where lower(email)=$1`.
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      // Don't surface admin errors to the client — degrade to "unknown" so
      // the user's flow can still proceed.
      return NextResponse.json({ exists: false, source: 'unknown' });
    }
    const hit = (data?.users ?? []).some((u: any) => (u.email ?? '').toLowerCase() === email);
    return NextResponse.json({ exists: hit, source: 'auth' });
  } catch {
    return NextResponse.json({ exists: false, source: 'unknown' });
  }
}
