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
      result.clerkFirstName = clerkUser?.firstName ?? null;

      try {
        const supabase = createSupabaseAdmin();

        // 1. Lookup existing user
        const { data, error: lookupErr } = await supabase
          .from('users')
          .select('id, clerk_id, email, role')
          .eq('clerk_id', userId)
          .maybeSingle();

        result.supabaseUser = data;
        result.supabaseLookupError = lookupErr?.message ?? null;

        // 2. If not found, attempt insert and report exact error
        if (!data && clerkUser) {
          const { data: inserted, error: insertErr } = await supabase
            .from('users')
            .insert({
              clerk_id: clerkUser.id,
              email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
              phone: clerkUser.phoneNumbers[0]?.phoneNumber ?? null,
              first_name: clerkUser.firstName,
              last_name: clerkUser.lastName,
              role: 'customer',
            })
            .select('id, clerk_id, email, role')
            .single();

          result.insertAttempt = {
            success: !insertErr,
            error: insertErr?.message ?? null,
            errorCode: insertErr?.code ?? null,
            insertedUser: inserted ?? null,
          };
        }
      } catch (e: any) {
        result.supabaseException = e.message;
      }
    }
  } catch (e: any) {
    result.authError = e.message;
  }

  return NextResponse.json(result, { status: 200 });
}
