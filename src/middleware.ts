import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/my-bookings', '/checkout', '/vendor', '/admin', '/api/bookings', '/api/kyc'];

function isProtected(pathname: string) {
  return PROTECTED.some(p => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return res; // mock mode, skip auth

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected(req.nextUrl.pathname) && !user) {
    // API routes must return JSON — not an HTML redirect — so the client
    // can read the error without hitting a JSON parse exception.
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Please sign in to continue', auth: false },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
