import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, hasClerkKeys } from '@/lib/mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result: Record<string, any> = {
    mockMode: isMockMode(),
    hasClerkKeys: hasClerkKeys(),
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasClerkPublishable: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      hasClerkSecret: !!process.env.CLERK_SECRET_KEY,
    },
  };

  try {
    const { userId } = await auth();
    result.clerkUserId = userId;

    if (userId) {
      const clerkUser = await currentUser();
      result.clerkEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

      try {
        const supabase = createSupabaseAdmin();
        const { data, error } = await supabase
          .from('users')
          .select('id, clerk_id, email, role')
          .eq('clerk_id', userId)
          .maybeSingle();
        result.supabaseUser = data;
        result.supabaseError = error?.message ?? null;
      } catch (e: any) {
        result.supabaseError = e.message;
      }
    }
  } catch (e: any) {
    result.authError = e.message;
  }

  return NextResponse.json(result, { status: 200 });
}
