import { NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns three one-time signed upload tokens — one per KYC document.
// The client uploads files directly to Supabase Storage using these tokens,
// which means file bytes never pass through the Next.js server.
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const ts = Date.now();
  const uid = user.id;

  const paths = {
    dl:      `${uid}/${ts}-dl.jpg`,
    aadhaar: `${uid}/${ts}-aadhaar.jpg`,
    selfie:  `${uid}/${ts}-selfie.jpg`,
  };

  const [dlRes, aadhaarRes, selfieRes] = await Promise.all([
    supabase.storage.from('kyc-docs').createSignedUploadUrl(paths.dl),
    supabase.storage.from('kyc-docs').createSignedUploadUrl(paths.aadhaar),
    supabase.storage.from('kyc-docs').createSignedUploadUrl(paths.selfie),
  ]);

  if (dlRes.error || aadhaarRes.error || selfieRes.error) {
    const msg = (dlRes.error || aadhaarRes.error || selfieRes.error)!.message;
    console.error('KYC presign error:', msg);
    return NextResponse.json({ error: 'Failed to prepare upload. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    dl:      { path: paths.dl,      token: dlRes.data!.token },
    aadhaar: { path: paths.aadhaar, token: aadhaarRes.data!.token },
    selfie:  { path: paths.selfie,  token: selfieRes.data!.token },
  });
}
