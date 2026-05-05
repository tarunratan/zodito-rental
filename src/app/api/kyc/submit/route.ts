import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_USER } from '@/lib/mock';

export const runtime = 'nodejs';

async function uploadFile(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  file: File,
  kind: string,
  ts: number,
): Promise<string> {
  const path = `${userId}/${ts}-${kind}.jpg`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from('kyc-docs')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`${kind} upload failed: ${error.message}`);
  return path;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const dlNumber    = ((form.get('dl_number') as string | null) ?? '').trim();
  const dlFront     = form.get('dl_front')      as File | null;
  const dlBack      = form.get('dl_back')       as File | null;
  const aadhaarFront = form.get('aadhaar_front') as File | null;
  const aadhaarBack  = form.get('aadhaar_back')  as File | null;
  const selfie      = form.get('selfie')        as File | null;

  if (dlNumber.length < 10 || !dlFront || !dlBack || !aadhaarFront || !aadhaarBack || !selfie) {
    return NextResponse.json(
      { error: 'All fields required: dl_number, dl_front, dl_back, aadhaar_front, aadhaar_back, selfie' },
      { status: 400 },
    );
  }

  if (isMockMode()) {
    MOCK_USER.kyc_status = 'pending';
    MOCK_USER.dl_number = dlNumber;
    MOCK_USER.kyc_submitted_at = new Date().toISOString();
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();
  const ts = Date.now();

  let dlFrontPath: string, dlBackPath: string;
  let aadhaarFrontPath: string, aadhaarBackPath: string;
  let selfiePath: string;

  try {
    [dlFrontPath, dlBackPath, aadhaarFrontPath, aadhaarBackPath, selfiePath] = await Promise.all([
      uploadFile(supabase, user.id, dlFront,      'dl_front',      ts),
      uploadFile(supabase, user.id, dlBack,        'dl_back',       ts),
      uploadFile(supabase, user.id, aadhaarFront,  'aadhaar_front', ts),
      uploadFile(supabase, user.id, aadhaarBack,   'aadhaar_back',  ts),
      uploadFile(supabase, user.id, selfie,         'selfie',        ts),
    ]);
  } catch (e: any) {
    console.error('KYC file upload error:', e);
    return NextResponse.json({ error: e.message ?? 'File upload failed' }, { status: 500 });
  }

  // Step 1 — update guaranteed-to-exist columns (front photos + status)
  const { error } = await supabase
    .from('users')
    .update({
      dl_number:            dlNumber,
      dl_photo_url:         dlFrontPath,
      aadhaar_photo_url:    aadhaarFrontPath,
      kyc_status:           'pending',
      kyc_submitted_at:     new Date().toISOString(),
      kyc_rejection_reason: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('KYC DB update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 2 — store back photos + selfie via RPCs (non-blocking).
  // Requires migration 027 (dl_back_photo_url, aadhaar_back_photo_url columns).
  // Requires migration 005 (selfie_with_dl_photo_url column + set_kyc_selfie RPC).
  supabase.rpc('set_kyc_back_photos', {
    p_user_id:     user.id,
    p_dl_back:     dlBackPath,
    p_aadhaar_back: aadhaarBackPath,
  }).then(({ error: e }: { error: { message: string } | null }) => {
    if (e) console.warn('set_kyc_back_photos RPC failed (run migration 027):', e.message);
  });

  supabase.rpc('set_kyc_selfie', { p_user_id: user.id, p_path: selfiePath })
    .then(({ error: e }: { error: { message: string } | null }) => {
      if (e) console.warn('set_kyc_selfie RPC failed (run migration 005):', e.message);
    });

  return NextResponse.json({ ok: true });
}
