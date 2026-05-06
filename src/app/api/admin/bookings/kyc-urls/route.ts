import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Returns 1-hour signed view URLs for KYC docs attached to a manual booking.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  }

  const bookingId = req.nextUrl.searchParams.get('booking_id');
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('bookings')
    .select('kyc_dl_front_url, kyc_dl_back_url, kyc_aadhaar_front_url, kyc_aadhaar_back_url, kyc_selfie_url')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const pathEntries: Array<{ key: string; path: string }> = [
    { key: 'dl_front',      path: data.kyc_dl_front_url },
    { key: 'dl_back',       path: data.kyc_dl_back_url },
    { key: 'aadhaar_front', path: data.kyc_aadhaar_front_url },
    { key: 'aadhaar_back',  path: data.kyc_aadhaar_back_url },
    { key: 'selfie',        path: data.kyc_selfie_url },
  ].filter((e): e is { key: string; path: string } => !!e.path);

  if (pathEntries.length === 0) return NextResponse.json({});

  const { data: signedData, error: signErr } = await supabase.storage
    .from('kyc-docs')
    .createSignedUrls(pathEntries.map(e => e.path), 3600);

  if (signErr) return NextResponse.json({ error: 'Failed to sign URLs' }, { status: 500 });

  const urls: Record<string, string> = {};
  (signedData ?? []).forEach((item: { signedUrl: string | null }, i: number) => {
    if (item.signedUrl) urls[pathEntries[i].key] = item.signedUrl;
  });

  return NextResponse.json(urls);
}
