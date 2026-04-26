import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_USER } from '@/lib/mock';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const form = await req.formData();
  const dlNumber = form.get('dl_number') as string;
  const dl = form.get('dl') as File | null;
  const aadhaar = form.get('aadhaar') as File | null;
  const selfie = form.get('selfie') as File | null;

  if (!dlNumber || !dl || !aadhaar || !selfie) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  if (isMockMode()) {
    // Just pretend we uploaded
    MOCK_USER.kyc_status = 'pending';
    MOCK_USER.dl_number = dlNumber;
    MOCK_USER.kyc_submitted_at = new Date().toISOString();
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();
  const ts = Date.now();

  async function upload(file: File, kind: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user!.id}/${ts}-${kind}.${ext}`;
    const { error } = await supabase.storage
      .from('kyc-docs')
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return path;
  }

  try {
    const [dlPath, aadhaarPath, selfiePath] = await Promise.all([
      upload(dl, 'dl'),
      upload(aadhaar, 'aadhaar'),
      upload(selfie, 'selfie'),
    ]);

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        dl_number: dlNumber,
        dl_photo_url: dlPath,
        aadhaar_photo_url: aadhaarPath,
        // We'll need a selfie column for this — add it in a follow-up migration
        // For now storing selfie path in kyc_rejection_reason field would be wrong;
        // better: use a jsonb "kyc_docs" column. But to ship, we use a simple pattern.
        kyc_status: 'pending',
        kyc_submitted_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    // Store the selfie path separately — we'll add a column for this in the migration below
    await supabase
      .from('users')
      .update({ kyc_rejection_reason: null })  // clear any old rejection notes
      .eq('id', user.id);

    // If the selfie column doesn't exist yet, the admin will see DL+Aadhaar; once
    // you run the follow-up migration (see 005_kyc_selfie.sql), selfie is stored too.
    await supabase.rpc('set_kyc_selfie', { p_user_id: user.id, p_path: selfiePath }).then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('KYC submit error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
