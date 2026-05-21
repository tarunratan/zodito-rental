import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/razorpay';
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
      id, booking_number, user_id, status, start_ts, end_ts, km_limit, base_price, gst_amount, advance_paid, pending_amount,
      bike_id,
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

  // Late-penalty surcharge for overdue self-extends — see /quote for rationale.
  // Quote response includes the same fields so the UI can show the breakdown
  // before payment; this block recomputes to keep the server authoritative.
  const nowMs = Date.now();
  const endMs = new Date(booking.end_ts).getTime();
  const hoursOverdue = Math.max(0, Math.ceil((nowMs - endMs) / 3_600_000));
  const latePenaltyRate = Number(
    (booking.bike as any)?.late_penalty_hour ??
    (booking.bike as any)?.model?.late_hourly_penalty ??
    49
  );
  const latePenalty = hoursOverdue * latePenaltyRate;

  const [{ data: overrides }, { data: customPkgs }] = await Promise.all([
    admin.from('bike_packages').select('tier, price, km_limit').eq('bike_id', booking.bike_id),
    admin.from('custom_packages').select('*').eq('bike_id', booking.bike_id).eq('is_active', true),
  ]);

  const modelPkgs = ((booking.bike as any)?.model?.packages ?? []) as { tier: any; price: number; km_limit: number }[];
  // UNION merge — see /api/bookings/[id]/extend/quote for the same rationale.
  const mergedPackages = mergeBikePackages(modelPkgs as any, (overrides ?? []) as any);

  const quote = quoteExtension({
    startTs: new Date(booking.start_ts),
    originalEndTs: new Date(booking.end_ts),
    newEndTs,
    originalBasePrice: Number(booking.base_price ?? 0),
    originalGstAmount: Number(booking.gst_amount ?? 0),
    originalKmLimit: Number(booking.km_limit ?? 0),
    availableTiers: mergedPackages.map(p => p.tier),
    packages: mergedPackages,
    customPackages: (customPkgs ?? []) as CustomPackage[],
  });

  if ('error' in quote) return NextResponse.json(quote, { status: 400 });
  // Total payable rolls in the late penalty. An extension that's only past
  // the drop-off time (no extra hours requested) still has totalDelta > 0
  // because of the penalty; an extension with zero baseDelta AND zero
  // penalty is rejected as a no-op.
  const totalPayable = quote.totalDelta + latePenalty;
  if (totalPayable <= 0) {
    return NextResponse.json({ error: 'Extension does not require any extra payment.' }, { status: 400 });
  }

  // Re-check availability immediately before reserving the Razorpay order.
  const { data: candidates } = await admin
    .from('bookings')
    .select('id, booking_number, status, start_ts, end_ts, created_at')
    .eq('bike_id', booking.bike_id)
    .in('status', ['confirmed', 'ongoing', 'pending_payment'])
    .lt('start_ts', newEndTs.toISOString())
    .gt('end_ts', booking.end_ts);

  const conflict = findConflictingBooking(new Date(booking.end_ts), newEndTs, candidates ?? [], { excludeId: booking.id });
  if (conflict) {
    return NextResponse.json({
      error: 'Bike is reserved by another booking during the requested extension window.',
      conflict_id: conflict.id,
    }, { status: 409 });
  }

  // Insert pending extension row.
  const { data: extension, error: insertErr } = await admin
    .from('booking_extensions')
    .insert({
      booking_id: booking.id,
      user_id: user.id,
      status: 'pending_payment',
      original_end_ts: booking.end_ts,
      new_end_ts: newEndTs.toISOString(),
      extra_hours: quote.extraHours,
      original_km_limit: quote.originalKmLimit,
      extra_km: quote.extraKm,
      new_km_limit: quote.newKmLimit,
      // The late penalty is folded into base_delta so the existing schema +
      // verify flow keeps working without a new column. total_delta is the
      // canonical Razorpay amount the customer actually pays.
      base_delta: quote.baseDelta + latePenalty,
      gst_delta:  quote.gstDelta,
      total_delta: totalPayable,
      matched_tier: quote.matchedTier,
      custom_package_id: quote.matchedCustomPackageId,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[extension-create] insert failed', insertErr);
    return NextResponse.json({ error: 'Could not create extension. Please try again.' }, { status: 500 });
  }

  // Razorpay order — uses booking_number as receipt + extension id in notes.
  try {
    const order = await createRazorpayOrder({
      amountRupees: totalPayable,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      userId: user.id,
    });
    await admin
      .from('booking_extensions')
      .update({ razorpay_order_id: order.id })
      .eq('id', extension.id);

    return NextResponse.json({
      extension_id: extension.id,
      booking_id: booking.id,
      booking_number: booking.booking_number,
      totalAmount: totalPayable,
      quote: { ...quote, latePenalty, hoursOverdue, latePenaltyRate, totalDelta: totalPayable },
      razorpay: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      prefill: {
        name:    `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
        email:   user.email ?? '',
        contact: user.phone ?? '',
      },
    });
  } catch (e: any) {
    await admin.from('booking_extensions').update({ status: 'failed' }).eq('id', extension.id);
    console.error('[extension-create] razorpay order failed', e);
    return NextResponse.json({ error: 'Payment gateway error. Please try again.' }, { status: 500 });
  }
}
