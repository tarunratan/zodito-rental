import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Returns 1-hour signed view URLs for a user's KYC documents.
// Called by the admin review UI when expanding a KYC record row.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .select('dl_photo_url, aadhaar_photo_url, selfie_with_dl_photo_url')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const pathEntries = [
    { key: 'dl',      path: data.dl_photo_url },
    { key: 'aadhaar', path: data.aadhaar_photo_url },
    { key: 'selfie',  path: data.selfie_with_dl_photo_url },
  ].filter((e): e is { key: string; path: string } => !!e.path);

  if (pathEntries.length === 0) {
    return NextResponse.json({});
  }

  const signedResults = await supabase.storage
    .from('kyc-docs')
    .createSignedUrls(pathEntries.map(e => e.path), 3600);

  if (signedResults.error) {
    console.error('KYC signed URL error:', signedResults.error);
    return NextResponse.json({ error: 'Failed to generate image URLs' }, { status: 500 });
  }

  const urls: Record<string, string> = {};
  (signedResults.data ?? []).forEach((item: { signedUrl: string | null; path: string; error: string | null }, i: number) => {
    if (item.signedUrl) urls[pathEntries[i].key] = item.signedUrl;
  });

  return NextResponse.json(urls);
}
