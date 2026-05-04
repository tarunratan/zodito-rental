import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_USER } from '@/lib/mock';

export const runtime = 'nodejs';

// Receives storage paths only — file bytes are never sent here.
// The client uploads directly to Supabase Storage via presigned URLs
// (see /api/kyc/presign), then calls this endpoint to record the paths.
const bodySchema = z.object({
  dl_number:    z.string().min(10).max(20),
  dl_path:      z.string().min(1),
  aadhaar_path: z.string().min(1),
  selfie_path:  z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid request: ' + parse.error.message }, { status: 400 });
  }
  const { dl_number, dl_path, aadhaar_path, selfie_path } = parse.data;

  // Tamper-proof: paths must live in this user's storage folder.
  // Client uploads using auth.uid() as the folder name (matches Supabase RLS),
  // so we validate against auth_id (not the app users.id).
  const prefix = `${user.auth_id}/`;
  if (![dl_path, aadhaar_path, selfie_path].every(p => p.startsWith(prefix))) {
    return NextResponse.json({ error: 'Invalid file paths' }, { status: 403 });
  }

  if (isMockMode()) {
    MOCK_USER.kyc_status = 'pending';
    MOCK_USER.dl_number = dl_number;
    MOCK_USER.kyc_submitted_at = new Date().toISOString();
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('users')
    .update({
      dl_number,
      dl_photo_url:             dl_path,
      aadhaar_photo_url:        aadhaar_path,
      selfie_with_dl_photo_url: selfie_path,
      kyc_status:               'pending',
      kyc_submitted_at:         new Date().toISOString(),
      kyc_rejection_reason:     null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('KYC submit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
