import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/razorpay';
import {
  calculatePrice,
  tierEndTs,
  isWithinStoreHours,
  effectiveModelIdForDate,
  splitCommission,
  computeCouponDiscount,
} from '@/lib/pricing';
import { isMockMode, mockBookingsStore } from '@/lib/mock';
import type { PackageTier } from '@/lib/supabase/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  bike_id: z.string(),
  tier: z.enum(['12hr', '24hr', '7day', '15day', '30day']),
  start_ts: z.string(),  // ISO
  extra_helmet_count: z.number().int().min(0).max(3).default(0),
  coupon_code: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // --- 1. Auth check
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to book' }, { status: 401 });
  }

  // --- 1b. KYC check (skipped in mock mode, which returns an approved user)
  if (user.kyc_status !== 'approved') {
    return NextResponse.json(
      {
        error: 'KYC verification required before booking',
        code: 'kyc_required',
        kyc_status: user.kyc_status,
      },
      { status: 403 }
    );
  }

  // --- 2. Parse & validate request
  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid request: ' + parse.error.message }, { status: 400 });
  }
  const body = parse.data;
  const startTs = new Date(body.start_ts);
  const endTs = tierEndTs(startTs, body.tier as PackageTier);

  // --- 3. Basic time validation
  if (startTs < new Date()) {
    return NextResponse.json({ error: 'Pickup time must be in the future' }, { status: 400 });
  }
  if (!isWithinStoreHours(startTs)) {
    return NextResponse.json(
      { error: 'Pickup time must be within store hours (6 AM – 10:30 PM)' },
      { status: 400 }
    );
  }

  // --- 4. MOCK MODE: just create an in-memory booking and return success
  if (isMockMode()) {
    return handleMockBooking({ user, body, startTs, endTs });
  }

  // --- 5. Real flow: fetch bike + model + packages
  const supabase = createSupabaseAdmin();
  const { data: bike, error: bikeErr } = await supabase
    .from('bikes')
    .select(`
      id, owner_type, vendor_id, frozen_from, frozen_until,
      model:bike_models!inner(
        id, has_weekend_override, weekend_override_model_id,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      vendor:vendors(commission_pct)
    `)
    .eq('id', body.bike_id)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .maybeSingle();

  if (bikeErr || !bike) {
    return NextResponse.json({ error: 'Bike not available for booking' }, { status: 404 });
  }

  // Check freeze window
  if (bike.frozen_until && new Date(bike.frozen_until) > startTs) {
    const frozenFrom = bike.frozen_from ? new Date(bike.frozen_from) : null;
    if (!frozenFrom || frozenFrom <= endTs) {
      return NextResponse.json(
        { error: 'This bike is currently under maintenance and unavailable for the selected dates.' },
        { status: 409 }
      );
    }
  }

  // --- 6. Resolve effective packages (weekend override)
  const model = bike.model as any;
  const effectiveModelId = effectiveModelIdForDate(model, startTs);
  let packages = model.packages;
  if (effectiveModelId !== model.id) {
    const { data: weekendPackages } = await supabase
      .from('bike_model_packages')
      .select('tier, price, km_limit')
      .eq('model_id', effectiveModelId);
    if (weekendPackages) packages = weekendPackages;
  }

  // --- 7. Resolve coupon (server-side re-validation; authoritative)
  let couponRow: { id: string; code: string; discount_type: string; discount_value: number } | null = null;
  if (body.coupon_code) {
    const { data: c } = await supabase
      .from('coupons')
      .select('id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active')
      .eq('code', body.coupon_code.toUpperCase().trim())
      .maybeSingle();

    if (c && c.is_active &&
        !(c.expires_at && new Date(c.expires_at) < new Date()) &&
        !(c.max_uses !== null && c.used_count >= c.max_uses)) {
      // Check user hasn't used it already
      const { data: used } = await supabase
        .from('coupon_uses')
        .select('id')
        .eq('coupon_id', c.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!used) {
        couponRow = { id: c.id, code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value) };
      }
    }
  }

  // --- 8. Price calculation (server-side; authoritative)
  // First compute without coupon to get gstAmount, then apply coupon
  const rawBreakdown = calculatePrice({
    packages,
    tier: body.tier as PackageTier,
    extraHelmetCount: body.extra_helmet_count,
    hasOriginalDL: true,
  });

  const couponDiscountAmount = couponRow
    ? computeCouponDiscount({
        discount_type: couponRow.discount_type as any,
        discount_value: couponRow.discount_value,
        subtotal: rawBreakdown.subtotal,
        gstAmount: rawBreakdown.gstAmount,
      })
    : 0;

  const breakdown = couponDiscountAmount > 0
    ? calculatePrice({
        packages,
        tier: body.tier as PackageTier,
        extraHelmetCount: body.extra_helmet_count,
        hasOriginalDL: true,
        couponDiscount: couponDiscountAmount,
      })
    : rawBreakdown;

  // --- 9. Commission split (only for vendor bikes)
  let platform_commission = breakdown.extraHelmetCharge;  // platform keeps all helmet revenue
  let vendor_payout = 0;
  if (bike.owner_type === 'vendor') {
    const commissionPct = (bike.vendor as any)?.commission_pct ?? 20;
    const split = splitCommission({
      basePrice: breakdown.basePrice,
      extraHelmetCharge: breakdown.extraHelmetCharge,
      commissionPct,
    });
    platform_commission = split.platformCommission;
    vendor_payout = split.vendorPayout;
  } else {
    // Platform-owned: platform keeps the full base price too
    platform_commission = breakdown.basePrice + breakdown.extraHelmetCharge;
  }

  // --- 10. Insert booking. DB exclusion constraint will reject overlaps atomically.
  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      bike_id: bike.id,
      start_ts: startTs.toISOString(),
      end_ts: endTs.toISOString(),
      package_tier: body.tier,
      base_price: breakdown.basePrice,
      km_limit: breakdown.kmLimit,
      extra_helmet_count: breakdown.extraHelmetCount,
      extra_helmet_price: breakdown.extraHelmetCharge,
      security_deposit: breakdown.securityDeposit,
      subtotal: breakdown.subtotal,
      gst_amount: breakdown.gstAmount,
      coupon_id: couponRow?.id ?? null,
      coupon_code: couponRow?.code ?? null,
      coupon_discount: breakdown.couponDiscount,
      total_amount: breakdown.totalAmount,
      platform_commission,
      vendor_payout,
      status: 'pending_payment',
      payment_status: 'pending',
      // payment_deadline defaults to now() + 10 min
    })
    .select('*')
    .single();

  if (insertErr) {
    if (insertErr.code === '23P01') {
      return NextResponse.json(
        { error: 'This bike is already booked for that time slot. Try a different time.' },
        { status: 409 }
      );
    }
    console.error('Booking insert error:', insertErr);
    return NextResponse.json({ error: 'Could not create booking. Please try again.' }, { status: 500 });
  }

  // --- 11. Record coupon usage (fire-and-forget)
  if (couponRow && breakdown.couponDiscount > 0) {
    supabase.from('coupon_uses').insert({
      coupon_id: couponRow.id,
      user_id: user.id,
      booking_id: booking.id,
      discount_amount: breakdown.couponDiscount,
    }).then(() =>
      supabase.rpc('increment_coupon_used_count', { p_coupon_id: couponRow!.id })
    ).catch(e => console.error('Coupon usage tracking error:', e));
  }

  // --- 12. Create Razorpay order
  try {
    const order = await createRazorpayOrder({
      amountRupees: breakdown.totalAmount,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      userId: user.id,
    });

    // Save the razorpay_order_id back on the booking
    await supabase
      .from('bookings')
      .update({ razorpay_order_id: order.id })
      .eq('id', booking.id);

    return NextResponse.json({
      booking_id: booking.id,
      booking_number: booking.booking_number,
      razorpay: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      prefill: {
        name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
        email: user.email ?? '',
        contact: user.phone ?? '',
      },
    });
  } catch (e: any) {
    // Razorpay order creation failed — mark booking as failed
    await supabase
      .from('bookings')
      .update({ status: 'payment_failed', payment_status: 'failed' })
      .eq('id', booking.id);
    console.error('Razorpay order error:', e);
    return NextResponse.json({ error: 'Payment gateway error. Please try again.' }, { status: 500 });
  }
}

function handleMockBooking(params: {
  user: any;
  body: z.infer<typeof bodySchema>;
  startTs: Date;
  endTs: Date;
}) {
  const id = 'mock-booking-' + Date.now();
  const booking = {
    id,
    booking_number: 'ZDMOCK' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
    bike_id: params.body.bike_id,
    user_id: params.user.id,
    start_ts: params.startTs.toISOString(),
    end_ts: params.endTs.toISOString(),
    package_tier: params.body.tier,
    extra_helmet_count: params.body.extra_helmet_count,
    status: 'confirmed',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
  };
  mockBookingsStore.push(booking);
  return NextResponse.json({
    mock: true,
    booking_id: id,
    booking_number: booking.booking_number,
  });
}
