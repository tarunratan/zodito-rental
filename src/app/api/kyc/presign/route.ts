import { NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns five one-time signed upload tokens — front + back for DL/Aadhaar + selfie.
// The client uploads file bytes directly to Supabase Storage using these tokens
// so nothing large passes through the Next.js server.
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const ts  = Date.now();
  const uid = user.id;

  const paths = {
    dl_front:      `${uid}/${ts}-dl_front.jpg`,
    dl_back:       `${uid}/${ts}-dl_back.jpg`,
    aadhaar_front: `${uid}/${ts}-aadhaar_front.jpg`,
    aadhaar_back:  `${uid}/${ts}-aadhaar_back.jpg`,
    selfie:        `${uid}/${ts}-selfie.jpg`,
  };

  const results = await Promise.all(
    Object.entries(paths).map(([key, path]) =>
      supabase.storage.from('kyc-docs').createSignedUploadUrl(path).then(r => ({ key, path, r }))
    )
  );

  const failed = results.find(x => x.r.error);
  if (failed) {
    console.error('KYC presign error:', failed.r.error?.message);
    return NextResponse.json({ error: 'Failed to prepare upload — please try again.' }, { status: 500 });
  }

  const tokens: Record<string, { path: string; token: string }> = {};
  results.forEach(({ key, path, r }) => {
    tokens[key] = { path, token: r.data!.token };
  });

  return NextResponse.json(tokens);
}
