import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ users: [] });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? 'pending';

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, kyc_status, dl_number, dl_photo_url, aadhaar_photo_url, selfie_with_dl_photo_url, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, created_at')
      .order('kyc_submitted_at', { ascending: false });

    if (status === 'pending') {
      query = query.eq('kyc_status', 'pending');
    } else if (status === 'all') {
      query = query.not('kyc_status', 'eq', 'not_submitted');
    } else {
      query = query.eq('kyc_status', status as any);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ users: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
