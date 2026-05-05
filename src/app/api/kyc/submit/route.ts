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

  const dlNumber = ((form.get('dl_number') as string | null) ?? '').trim();
  const dl      = form.get('dl')      as File | null;
  const aadhaar = form.get('aadhaar') as File | null;
  const selfie  = form.get('selfie')  as File | null;

  if (dlNumber.length < 10 || !dl || !aadhaar || !selfie) {
    return NextResponse.json({ error: 'All fields required (dl_number, dl, aadhaar, selfie)' }, { status: 400 });
  }

  if (isMockMode()) {
    MOCK_USER.kyc_status = 'pending';
    MOCK_USER.dl_number = dlNumber;
    MOCK_USER.kyc_submitted_at = new Date().toISOString();
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();
  const ts = Date.now();

  let dlPath: string, aadhaarPath: string, selfiePath: string;
  try {
    [dlPath, aadhaarPath, selfiePath] = await Promise.all([
      uploadFile(supabase, user.id, dl,      'dl',      ts),
      uploadFile(supabase, user.id, aadhaar, 'aadhaar', ts),
      uploadFile(supabase, user.id, selfie,  'selfie',  ts),
    ]);
  } catch (e: any) {
    console.error('KYC file upload error:', e);
    return NextResponse.json({ error: e.message ?? 'File upload failed' }, { status: 500 });
  }

  // Step 1 — update all columns that are guaranteed to exist in the schema
  const { error } = await supabase
    .from('users')
    .update({
      dl_number:            dlNumber,
      dl_photo_url:         dlPath,
      aadhaar_photo_url:    aadhaarPath,
      kyc_status:           'pending',
      kyc_submitted_at:     new Date().toISOString(),
      kyc_rejection_reason: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('KYC DB update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 2 — store selfie path via RPC so it bypasses the PostgREST schema cache.
  // Fire-and-forget: never fails the submission.
  // Requires migration 005 (ALTER TABLE users ADD COLUMN selfie_with_dl_photo_url).
  supabase.rpc('set_kyc_selfie', { p_user_id: user.id, p_path: selfiePath })
    .then(({ error: e }: { error: { message: string } | null }) => { if (e) console.warn('set_kyc_selfie RPC failed (run migration 005):', e.message); });

  return NextResponse.json({ ok: true });
}
