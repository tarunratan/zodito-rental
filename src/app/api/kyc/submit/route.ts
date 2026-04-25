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
        selfie_with_dl_photo_url: selfiePath,
        kyc_status: 'pending',
        kyc_submitted_at: new Date().toISOString(),
        kyc_rejection_reason: null,  // clear any previous rejection
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('KYC submit error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
