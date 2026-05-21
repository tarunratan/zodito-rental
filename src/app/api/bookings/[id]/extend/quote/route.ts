import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { quoteExtension } from '@/lib/extension-pricing';
import { findConflictingBooking } from '@/lib/booking-overlap';
import { mergeBikePackages, type CustomPackage, isWithinStoreHours } from '@/lib/pricing';

export const runtime = 'nodejs';

const schema = z.object({ new_end_ts: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const newEndTs = new Date(parse.data.new_end_ts);
  if (isNaN(newEndTs.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  // Store window guard — UI restricts to 6 AM – 10 PM IST, mirror it server-side.
  if (!isWithinStoreHours(newEndTs)) {
    return NextResponse.json(
      { error: 'Drop-offs accepted only between 6 AM and 10:30 PM IST' },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();

  const { data: booking } = await admin
    .from('bookings')
    .select(`
      id, user_id, status, start_ts, end_ts, km_limit, base_price, gst_amount, bike_id,
      bike:bikes!inner(
        id, late_penalty_hour,
        model:bike_models!inner(late_hourly_penalty, packages:bike_model_packages(tier, price, km_limit))
      )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.user_id !== user.id) return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
  if (booking.status !== 'ongoing') {
    return NextResponse.json({ error: 'Only ongoing bookings can be extended' }, { status: 400 });
  }
  // Overdue bookings are still extendable, BUT a late penalty is added to the
  // Razorpay total. This is intentional — customers were ghosting on phone
  // promises ("I'll pay later") and keeping bikes; pre-collecting via Razorpay
  // is the fix. The late penalty is computed below from the bike's per-hour
  // rate (falls back to model default, then ₹49).
  const nowMs = Date.now();
  const endMs = new Date(booking.end_ts).getTime();
  const hoursOverdue = Math.max(0, Math.ceil((nowMs - endMs) / 3_600_000));
  const latePenaltyRate = Number(
    (booking.bike as any)?.late_penalty_hour ??
    (booking.bike as any)?.model?.late_hourly_penalty ??
    49
  );
  const latePenalty = hoursOverdue * latePenaltyRate;

  // Per-bike overrides + custom packages, same shape the booking-create flow uses.
  const [{ data: overrides }, { data: customPkgs }] = await Promise.all([
    admin.from('bike_packages').select('tier, price, km_limit').eq('bike_id', booking.bike_id),
    admin.from('custom_packages').select('*').eq('bike_id', booking.bike_id).eq('is_active', true),
  ]);

  const modelPkgs = ((booking.bike as any)?.model?.packages ?? []) as { tier: any; price: number; km_limit: number }[];
  // UNION merge — admin overrides for tiers the model never seeded (36hr, 2day,
  // 60hr, 3day, …) must appear in the extension price list too.
  const mergedPackages = mergeBikePackages(modelPkgs as any, (overrides ?? []) as any);
  const availableTiers = mergedPackages.map(p => p.tier);

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

  // Stack the late penalty onto the total payable. base/gst breakdown stays
  // pure (extension package math); the late penalty is shown as a separate
  // line item in the UI and rolled into totalDelta so Razorpay charges all of
  // it in one transaction.
  const quoteWithPenalty = {
    ...quote,
    latePenalty,
    hoursOverdue,
    latePenaltyRate,
    totalDelta: quote.totalDelta + latePenalty,
  };

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
      quote: quoteWithPenalty,
      conflict: {
        booking_id: conflict.id,
        booking_number: conflict.booking_number,
        end_ts: conflict.end_ts,
      },
      available: false,
      error: 'Bike is reserved by another booking during the requested extension window.',
    }, { status: 200 });
  }

  return NextResponse.json({ quote: quoteWithPenalty, available: true });
}
