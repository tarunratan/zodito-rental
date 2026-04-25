import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded.role ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const result: Record<string, any> = {
    mockMode: isMockMode(),
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnon: !!anonKey,
      hasServiceRole: !!serviceKey,
    },
    serviceKeyDecodedRole: decodeJwtRole(serviceKey),
    serviceKeyIsCorrect: decodeJwtRole(serviceKey) === 'service_role',
  };

  if (isMockMode()) {
    return NextResponse.json({ ...result, note: 'mock mode' });
  }

  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    result.supabaseAuthUser = user
      ? { id: user.id, email: user.email, metadata: user.user_metadata }
      : null;
    result.supabaseAuthError = authErr?.message ?? null;

    if (user) {
      const admin = createSupabaseAdmin();
      const { data, error: lookupErr } = await admin
        .from('users')
        .select('id, auth_id, email, role, kyc_status')
        .eq('auth_id', user.id)
        .maybeSingle();

      result.appUser = data;
      result.appUserLookupError = lookupErr?.message ?? null;
    }
  } catch (e: any) {
    result.exception = e.message;
  }

  return NextResponse.json(result, { status: 200 });
}
