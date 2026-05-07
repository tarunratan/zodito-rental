import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Returns 1-hour signed view URLs for KYC docs.
// For manual bookings: reads from booking-level kyc_* columns.
// For online bookings: also reads from the user's profile columns as fallback.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  }

  const bookingId = req.nextUrl.searchParams.get('booking_id');
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('user_id, kyc_dl_front_url, kyc_dl_back_url, kyc_aadhaar_front_url, kyc_aadhaar_back_url, kyc_selfie_url')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  // Collect paths: booking-level docs take priority; fall back to user profile docs.
  let dlFront      = booking.kyc_dl_front_url;
  let dlBack       = booking.kyc_dl_back_url;
  let aadhaarFront = booking.kyc_aadhaar_front_url;
  let aadhaarBack  = booking.kyc_aadhaar_back_url;
  let selfie       = booking.kyc_selfie_url;

  if (booking.user_id && !(dlFront || dlBack || aadhaarFront || aadhaarBack || selfie)) {
    const { data: profile } = await supabase
      .from('users')
      .select('dl_photo_url, dl_back_photo_url, aadhaar_photo_url, aadhaar_back_photo_url, selfie_with_dl_photo_url')
      .eq('id', booking.user_id)
      .maybeSingle();
    if (profile) {
      dlFront      = profile.dl_photo_url;
      dlBack       = profile.dl_back_photo_url;
      aadhaarFront = profile.aadhaar_photo_url;
      aadhaarBack  = profile.aadhaar_back_photo_url;
      selfie       = profile.selfie_with_dl_photo_url;
    }
  }

  const pathEntries: Array<{ key: string; path: string }> = [
    { key: 'dl_front',      path: dlFront! },
    { key: 'dl_back',       path: dlBack! },
    { key: 'aadhaar_front', path: aadhaarFront! },
    { key: 'aadhaar_back',  path: aadhaarBack! },
    { key: 'selfie',        path: selfie! },
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
