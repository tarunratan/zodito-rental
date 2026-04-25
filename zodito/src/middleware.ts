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

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Must be direct default export — wrapping in another function breaks Clerk v6
// auth context propagation to server components.
export default clerkMiddleware(async (auth, req) => {
  if (hasClerk && isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
