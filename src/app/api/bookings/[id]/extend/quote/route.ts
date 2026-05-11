import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { quoteExtension } from '@/lib/extension-pricing';
import { findConflictingBooking } from '@/lib/booking-overlap';
import type { CustomPackage } from '@/lib/pricing';

export const runtime = 'nodejs';

const schema = z.object({ new_end_ts: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const newEndTs = new Date(parse.data.new_end_ts);
  if (isNaN(newEndTs.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const admin = createSupabaseAdmin();

  const { data: booking } = await admin
    .from('bookings')
    .select(`
      id, user_id, status, start_ts, end_ts, km_limit, base_price, gst_amount, bike_id,
      bike:bikes!inner(
        id,
        model:bike_models!inner(packages:bike_model_packages(tier, price, km_limit))
      )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.user_id !== user.id) return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
  if (booking.status !== 'ongoing') {
    return NextResponse.json({ error: 'Only ongoing bookings can be extended' }, { status: 400 });
  }

  // Per-bike overrides + custom packages, same shape the booking-create flow uses.
  const [{ data: overrides }, { data: customPkgs }] = await Promise.all([
    admin.from('bike_packages').select('tier, price, km_limit').eq('bike_id', booking.bike_id),
    admin.from('custom_packages').select('*').eq('bike_id', booking.bike_id).eq('is_active', true),
  ]);

  const modelPkgs = ((booking.bike as any)?.model?.packages ?? []) as { tier: string; price: number; km_limit: number }[];
  const mergedPackages = modelPkgs.map(mp => {
    const ov = (overrides ?? []).find((o: any) => o.tier === mp.tier);
    return ov ? { ...mp, price: ov.price, km_limit: ov.km_limit } as any : mp as any;
  });
  const availableTiers = mergedPackages.map((p: any) => p.tier);

  const quote = quoteExtension({
    startTs: new Date(booking.start_ts),
    originalEndTs: new Date(booking.end_ts),
    newEndTs,
    originalBasePrice: Number(booking.base_price ?? 0),
    originalGstAmount: Number(booking.gst_amount ?? 0),
    originalKmLimit: Number(booking.km_limit ?? 0),
    availableTiers,
    packages: mergedPackages,
    customPackages: (customPkgs ?? []) as CustomPackage[],
  });

  if ('error' in quote) return NextResponse.json(quote, { status: 400 });

  // Conflict check: another booking on this bike covering the extended window?
  const { data: candidates } = await admin
    .from('bookings')
    .select('id, booking_number, status, start_ts, end_ts, created_at')
    .eq('bike_id', booking.bike_id)
    .in('status', ['confirmed', 'ongoing', 'pending_payment'])
    .lt('start_ts', newEndTs.toISOString())
    .gt('end_ts', booking.end_ts);

  const conflict = findConflictingBooking(
    new Date(booking.end_ts),
    newEndTs,
    candidates ?? [],
    { excludeId: booking.id },
  );

  if (conflict) {
    return NextResponse.json({
      quote,
      conflict: {
        booking_id: conflict.id,
        booking_number: conflict.booking_number,
        end_ts: conflict.end_ts,
      },
      available: false,
      error: 'Bike is reserved by another booking during the requested extension window.',
    }, { status: 200 });
  }

  return NextResponse.json({ quote, available: true });
}
