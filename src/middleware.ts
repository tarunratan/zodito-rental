import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

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
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// clerkMiddleware must be the direct default export — wrapping it in another
// function prevents Clerk v6 from propagating auth headers to server components,
// causing auth() to return userId:null even for authenticated users.
export default clerkMiddleware(async (auth, req) => {
  if (hasClerk && isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
