import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require sign-in. Public routes = everything else.
const isProtectedRoute = createRouteMatcher([
  '/my-bookings(.*)',
  '/checkout(.*)',
  '/vendor(.*)',
  '/admin(.*)',
  '/api/bookings(.*)',
  '/api/kyc(.*)',
]);

// When Clerk isn't configured (mock mode), we skip all auth checks.
// Everything is accessible — great for UI tuning but obviously not for prod.
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export default function middleware(req: NextRequest, evt: any) {
  if (!hasClerk) return NextResponse.next();
  return clerkHandler(req, evt);
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
