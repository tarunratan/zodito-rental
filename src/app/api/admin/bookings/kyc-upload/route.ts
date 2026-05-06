import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const VALID_DOC_TYPES = ['dl_front', 'dl_back', 'aadhaar_front', 'aadhaar_back', 'selfie'] as const;
type DocType = typeof VALID_DOC_TYPES[number];

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const docType = form.get('doc_type') as string | null;

  if (!file || !docType) {
    return NextResponse.json({ error: 'file and doc_type are required' }, { status: 400 });
  }
  if (!(VALID_DOC_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: `doc_type must be one of: ${VALID_DOC_TYPES.join(', ')}` }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `manual/${Date.now()}-${docType}.${ext}`;

  const { error } = await supabase.storage
    .from('kyc-docs')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error('KYC upload error:', error);
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ path });
}
