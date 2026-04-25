import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseServer } from '@/lib/supabase/server';
import { getCurrentAppUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/debug-booking?bike_id=xxx
// Walks through every prerequisite for booking and reports pass/fail on each step.
export async function GET(req: NextRequest) {
  const bikeId = req.nextUrl.searchParams.get('bike_id');
  const out: Record<string, any> = {};

  // 1. Auth user
  try {
    const user = await getCurrentAppUser();
    out.step1_auth = user
      ? { ok: true, user_id: user.id, auth_id: user.auth_id, role: user.role, kyc: user.kyc_status }
      : { ok: false, error: 'getCurrentAppUser returned null' };
  } catch (e: any) {
    out.step1_auth = { ok: false, error: e.message };
  }

  // 2. Admin client — can it read bikes?
  try {
    const admin = createSupabaseAdmin();
    const { count, error } = await admin.from('bikes').select('id', { count: 'exact', head: true });
    out.step2_admin_client = error
      ? { ok: false, error: error.message, code: error.code }
      : { ok: true, bike_count: count };
  } catch (e: any) {
    out.step2_admin_client = { ok: false, error: e.message };
  }

  // 3. User session client — can it read its own users row?
  try {
    const userClient = await createSupabaseServer();
    const { data: { user: authUser } } = await userClient.auth.getUser();
    if (!authUser) {
      out.step3_user_client = { ok: false, error: 'No auth session in request cookies' };
    } else {
      const { data, error } = await userClient
        .from('users').select('id, role, kyc_status').eq('auth_id', authUser.id).maybeSingle();
      out.step3_user_client = error
        ? { ok: false, error: error.message }
        : { ok: true, row: data };
    }
  } catch (e: any) {
    out.step3_user_client = { ok: false, error: e.message };
  }

  // 4. Specific bike lookup (if bike_id provided)
  if (bikeId) {
    try {
      const admin = createSupabaseAdmin();
      const { data, error } = await admin
        .from('bikes')
        .select('id, is_active, listing_status, owner_type')
        .eq('id', bikeId)
        .maybeSingle();
      out.step4_bike = error
        ? { ok: false, error: error.message }
        : data
          ? { ok: true, ...data }
          : { ok: false, error: 'Bike not found with this id' };
    } catch (e: any) {
      out.step4_bike = { ok: false, error: e.message };
    }
  } else {
    out.step4_bike = { skipped: true, hint: 'Add ?bike_id=xxx to test a specific bike' };
  }

  // 5. Razorpay config
  out.step5_razorpay = {
    has_key_id: !!process.env.RAZORPAY_KEY_ID,
    has_key_secret: !!process.env.RAZORPAY_KEY_SECRET,
    key_id_prefix: process.env.RAZORPAY_KEY_ID?.slice(0, 8) ?? null,
    is_test_mode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') ?? false,
  };

  // 6. Supabase env
  out.step6_env = {
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    has_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    has_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    service_role_key_looks_valid: (() => {
      try {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        return payload.role === 'service_role';
      } catch { return false; }
    })(),
  };

  const allOk = Object.values(out).every((v: any) => v.ok !== false);
  return NextResponse.json({ all_ok: allOk, ...out }, { status: 200 });
}
