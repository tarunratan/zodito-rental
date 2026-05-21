/**
 * Supabase Auth callback — the missing piece that broke the email-link
 * password reset and (depending on how the email template is configured)
 * the signup confirmation too.
 *
 * Supabase sends links like:
 *    https://<app>/auth/callback?code=<one-time-code>&next=/reset-password
 *
 * The `code` is meaningless until it's exchanged for a session. Without
 * this route the customer landed somewhere that just called getSession(),
 * found nothing, and got bounced to / by the middleware.
 *
 * After exchange the customer is redirected to `next` (defaults to
 * /reset-password for the recovery flow). For signup confirmation set
 * `next=/` or `/sign-in` in the Supabase email template.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code');
  const next     = req.nextUrl.searchParams.get('next') ?? '/reset-password';
  const errCode  = req.nextUrl.searchParams.get('error') ?? req.nextUrl.searchParams.get('error_code');
  const errDesc  = req.nextUrl.searchParams.get('error_description');

  // Supabase appends ?error=... when the link is expired or already used.
  // Bounce to forgot-password with a readable banner instead of swallowing it.
  if (errCode) {
    const url = new URL('/forgot-password', req.url);
    url.searchParams.set('error', errDesc ?? errCode);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  // We need to mutate cookies on the response, so build it up-front and
  // pass its cookie store into createServerClient.
  const res = NextResponse.redirect(new URL(next, req.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: Array<{ name: string; value: string; options?: any }>) => {
          toSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const url = new URL('/forgot-password', req.url);
    url.searchParams.set('error', error.message);
    return NextResponse.redirect(url);
  }

  return res;
}
