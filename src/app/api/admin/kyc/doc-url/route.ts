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

  // Fetch core columns (always exist)
  const { data, error } = await supabase
    .from('users')
    .select('dl_photo_url, aadhaar_photo_url, selfie_with_dl_photo_url')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Fetch back-photo columns (added in migration 027) — graceful fallback if not yet run
  let backData: { dl_back_photo_url: string | null; aadhaar_back_photo_url: string | null } =
    { dl_back_photo_url: null, aadhaar_back_photo_url: null };
  try {
    const r = await supabase
      .from('users')
      .select('dl_back_photo_url, aadhaar_back_photo_url')
      .eq('id', userId)
      .maybeSingle();
    if (!r.error && r.data) backData = r.data as typeof backData;
  } catch { /* migration 027 not yet run — silently skip */ }

  const pathEntries: Array<{ key: string; path: string }> = [
    { key: 'dl',           path: data.dl_photo_url },
    { key: 'dl_back',      path: backData.dl_back_photo_url },
    { key: 'aadhaar',      path: data.aadhaar_photo_url },
    { key: 'aadhaar_back', path: backData.aadhaar_back_photo_url },
    { key: 'selfie',       path: data.selfie_with_dl_photo_url },
  ].filter((e): e is { key: string; path: string } => !!e.path);

  if (pathEntries.length === 0) return NextResponse.json({});

  const signedResults = await supabase.storage
    .from('kyc-docs')
    .createSignedUrls(pathEntries.map(e => e.path), 3600);

  if (signedResults.error) {
    console.error('KYC signed URL error:', signedResults.error);
    return NextResponse.json({ error: 'Failed to generate image URLs' }, { status: 500 });
  }

  const urls: Record<string, string> = {};
  (signedResults.data ?? []).forEach((item: { signedUrl: string | null }, i: number) => {
    if (item.signedUrl) urls[pathEntries[i].key] = item.signedUrl;
  });

  return NextResponse.json(urls);
}
