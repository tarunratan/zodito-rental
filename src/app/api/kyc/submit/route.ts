import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_USER } from '@/lib/mock';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    dl_number,
    dl_front_path,
    dl_back_path,
    aadhaar_front_path,
    aadhaar_back_path,
    selfie_path,
  } = body ?? {};

  const dlNumber = (dl_number as string | null)?.trim() ?? '';
  if (
    dlNumber.length < 10 ||
    !dl_front_path || !dl_back_path ||
    !aadhaar_front_path || !aadhaar_back_path ||
    !selfie_path
  ) {
    return NextResponse.json(
      { error: 'All fields required: dl_number, dl_front_path, dl_back_path, aadhaar_front_path, aadhaar_back_path, selfie_path' },
      { status: 400 },
    );
  }

  // Ensure every path is scoped to this user's folder (prevents path traversal)
  const prefix = `${user.id}/`;
  if (
    !String(dl_front_path).startsWith(prefix) ||
    !String(dl_back_path).startsWith(prefix) ||
    !String(aadhaar_front_path).startsWith(prefix) ||
    !String(aadhaar_back_path).startsWith(prefix) ||
    !String(selfie_path).startsWith(prefix)
  ) {
    return NextResponse.json({ error: 'Invalid file paths' }, { status: 403 });
  }

  if (isMockMode()) {
    MOCK_USER.kyc_status = 'pending';
    MOCK_USER.dl_number = dlNumber;
    MOCK_USER.kyc_submitted_at = new Date().toISOString();
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();

  // Step 1 — update guaranteed-to-exist columns
  const { error } = await supabase
    .from('users')
    .update({
      dl_number:            dlNumber,
      dl_photo_url:         dl_front_path,
      aadhaar_photo_url:    aadhaar_front_path,
      kyc_status:           'pending',
      kyc_submitted_at:     new Date().toISOString(),
      kyc_rejection_reason: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('KYC DB update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 2 — back photos via RPC (requires migration 027)
  supabase.rpc('set_kyc_back_photos', {
    p_user_id:      user.id,
    p_dl_back:      dl_back_path,
    p_aadhaar_back: aadhaar_back_path,
  }).then(({ error: e }: { error: { message: string } | null }) => {
    if (e) console.warn('set_kyc_back_photos RPC failed (run migration 027):', e.message);
  });

  // Step 3 — selfie via RPC (requires migration 005 / 027)
  supabase.rpc('set_kyc_selfie', { p_user_id: user.id, p_path: selfie_path })
    .then(({ error: e }: { error: { message: string } | null }) => {
      if (e) console.warn('set_kyc_selfie RPC failed:', e.message);
    });

  return NextResponse.json({ ok: true });
}
