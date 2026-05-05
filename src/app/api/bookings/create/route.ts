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
import type { CustomPackage } from '@/lib/pricing';
import { isMockMode, mockBookingsStore } from '@/lib/mock';
import type { PackageTier } from '@/lib/supabase/types';

export const runtime = 'nodejs';

const ALL_TIERS = [
  '6hr','12hr','24hr','36hr','48hr','60hr','72hr','96hr','120hr','144hr',
  '2day','3day','7day','15day','30day','weekly_flex','monthly_flex',
] as const;

const bodySchema = z.object({
  bike_id: z.string(),
  tier: z.enum(ALL_TIERS).optional(),
  custom_package_id: z.string().uuid().optional(),
  actual_days: z.number().int().min(2).max(29).optional(),
  start_ts: z.string(),
  extra_helmet_count: z.number().int().min(0).max(3).default(0),
  mobile_holder: z.boolean().default(false),
  payment_method: z.enum(['online', 'at_pickup']).default('online'),
  coupon_code: z.string().optional(),
  booking_lat: z.number(),
  booking_lng: z.number(),
}).refine(d => d.tier || d.custom_package_id, { message: 'tier or custom_package_id required' });

export async function POST(req: NextRequest) {
  // --- 1. Parse & validate request body (no I/O)
  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid request: ' + parse.error.message }, { status: 400 });
  }
  const body = parse.data;
  const startTs = new Date(body.start_ts);
  // endTs determined after custom package lookup (below) for custom bookings
  const endTs = body.tier
    ? tierEndTs(startTs, body.tier as PackageTier, body.actual_days)
    : new Date(0); // placeholder — replaced below for custom package

  // --- 2. Basic time validation (no I/O)
  if (startTs < new Date()) {
    return NextResponse.json({ error: 'Pickup time must be in the future' }, { status: 400 });
  }
  if (!isWithinStoreHours(startTs)) {
    return NextResponse.json(
      { error: 'Pickup time must be within store hours (6 AM – 10:30 PM)' },
      { status: 400 }
    );
  }

  // --- 3. MOCK MODE
  if (isMockMode()) {
    const mockEndTs = body.tier ? tierEndTs(startTs, body.tier as PackageTier, body.actual_days) : new Date(startTs.getTime() + 86_400_000);
    return handleMockBooking({ body, startTs, endTs: mockEndTs });
  }

  const admin = createSupabaseAdmin();

  // Coupon promise — fire immediately so it overlaps with auth
  const couponPromise = body.coupon_code
    ? admin
        .from('coupons')
        .select('id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active')
        .eq('code', body.coupon_code.toUpperCase().trim())
        .maybeSingle()
    : Promise.resolve({ data: null });

  // --- 4. Auth + bike fetch + coupon + custom package all in parallel
  const customPkgPromise = body.custom_package_id
    ? admin.from('custom_packages').select('*').eq('id', body.custom_package_id).eq('bike_id', body.bike_id).eq('is_active', true).maybeSingle()
    : Promise.resolve({ data: null });

  const [user, { data: bike, error: bikeErr }, { data: couponData }, { data: customPkgData }] = await Promise.all([
    getCurrentAppUser(),
    admin
      .from('bikes')
      .select(`
        id, owner_type, vendor_id,
        frozen_from, frozen_until, freeze_reason,
        model:bike_models!inner(
          id, has_weekend_override, weekend_override_model_id,
          packages:bike_model_packages(tier, price, km_limit)
        ),
        vendor:vendors(commission_pct)
      `)
      .eq('id', body.bike_id)
      .eq('is_active', true)
      .eq('listing_status', 'approved')
      .maybeSingle(),
    couponPromise,
    customPkgPromise,
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Please sign in to book' }, { status: 401 });
  }

  if (bikeErr || !bike) {
    return NextResponse.json({ error: 'Bike not available for booking' }, { status: 404 });
  }

  // Validate custom package (if used) and fix up endTs
  const customPkg = customPkgData as CustomPackage | null;
  if (body.custom_package_id && !customPkg) {
    return NextResponse.json({ error: 'Custom package not found or inactive' }, { status: 404 });
  }
  const resolvedEndTs = customPkg
    ? new Date(startTs.getTime() + customPkg.duration_hours * 3_600_000)
    : endTs;

  // --- 5. Check freeze window overlap
  const b = bike as any;
  if (b.frozen_until && b.frozen_from) {
    const frozenFrom = new Date(b.frozen_from);
    const frozenUntil = new Date(b.frozen_until);
    if (frozenFrom < resolvedEndTs && frozenUntil > startTs) {
      return NextResponse.json(
        { error: `This bike is under maintenance until ${frozenUntil.toLocaleString('en-IN')}${b.freeze_reason ? '. Reason: ' + b.freeze_reason : ''}` },
        { status: 409 }
      );
    }
  }

  // --- 6. Resolve weekend override + coupon usage in parallel (no-ops if not needed)
  const model = (bike as any).model as any;
  const effectiveModelId = effectiveModelIdForDate(model, startTs);

  const c = couponData as any;
  const couponValid = c && c.is_active &&
    !(c.expires_at && new Date(c.expires_at) < new Date()) &&
    !(c.max_uses !== null && c.used_count >= c.max_uses);

  const [weekendResult, couponUsedResult] = await Promise.all([
    effectiveModelId !== model.id
      ? admin.from('bike_model_packages').select('tier, price, km_limit').eq('model_id', effectiveModelId)
      : Promise.resolve({ data: null }),
    couponValid
      ? admin.from('coupon_uses').select('id').eq('coupon_id', c.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let packages = model.packages;
  if (weekendResult.data) packages = weekendResult.data;

  let couponRow: { id: string; code: string; discount_type: string; discount_value: number } | null = null;
  if (couponValid && !couponUsedResult.data) {
    couponRow = { id: c.id, code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value) };
  }

  // --- 7. Price calculation (server-side; authoritative)
  const priceParams = customPkg
    ? { customPackage: customPkg }
    : { packages, tier: body.tier as PackageTier, actualDays: body.actual_days };

  const rawBreakdown = calculatePrice({
    ...priceParams,
    extraHelmetCount: body.extra_helmet_count,
    hasOriginalDL: true,
    includeMobileHolder: body.mobile_holder,
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
    ? calculatePrice({ ...priceParams, extraHelmetCount: body.extra_helmet_count, hasOriginalDL: true, includeMobileHolder: body.mobile_holder, couponDiscount: couponDiscountAmount })
    : rawBreakdown;

  // --- 8. Commission split
  let platform_commission = breakdown.extraHelmetCharge;
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
    platform_commission = breakdown.basePrice + breakdown.extraHelmetCharge;
  }

  // --- 9. Capture client IP — server-side, no permission required, always available
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

  // --- 10. Insert booking — use admin client (user identity verified above, user_id explicitly set)
  //          This avoids creating a second Supabase server client just for RLS
  const { data: booking, error: insertErr } = await admin
    .from('bookings')
    .insert({
      user_id: user.id,
      bike_id: bike.id,
      start_ts: startTs.toISOString(),
      end_ts: resolvedEndTs.toISOString(),
      package_tier: body.tier ?? null,
      custom_package_id: customPkg?.id ?? null,
      base_price: breakdown.basePrice,
      km_limit: breakdown.kmLimit,
      extra_helmet_count: breakdown.extraHelmetCount,
      extra_helmet_price: breakdown.extraHelmetCharge + breakdown.mobileHolderCharge,
      security_deposit: breakdown.securityDeposit,
      subtotal: breakdown.subtotal,
      gst_amount: breakdown.gstAmount,
      coupon_id: couponRow?.id ?? null,
      coupon_code: couponRow?.code ?? null,
      coupon_discount: breakdown.couponDiscount,
      total_amount: breakdown.totalAmount,
      platform_commission,
      vendor_payout,
      status: body.payment_method === 'at_pickup' ? 'confirmed' : 'pending_payment',
      payment_status: 'pending',
      booking_ip: clientIp,
      booking_lat: body.booking_lat,
      booking_lng: body.booking_lng,
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
    return NextResponse.json({
      error: 'Could not create booking. Please try again.',
      _debug: { code: insertErr.code, message: insertErr.message, details: insertErr.details },
    }, { status: 500 });
  }

  // --- 10. Record coupon usage (fire-and-forget, does not block response)
  if (couponRow && breakdown.couponDiscount > 0) {
    admin.from('coupon_uses').insert({
      coupon_id: couponRow.id, user_id: user.id, booking_id: booking.id, discount_amount: breakdown.couponDiscount,
    }).then(() =>
      admin.rpc('increment_coupon_used_count', { p_coupon_id: couponRow!.id })
    ).catch((e: unknown) => console.error('Coupon tracking error:', e));
  }

  // --- 11. Cash (pay at pickup) — done, return immediately
  if (body.payment_method === 'at_pickup') {
    return NextResponse.json({
      booking_id: booking.id,
      booking_number: booking.booking_number,
      at_pickup: true,
    });
  }

  // --- 12. Online — create Razorpay order
  try {
    const order = await createRazorpayOrder({
      amountRupees: breakdown.totalAmount,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      userId: user.id,
    });

    // Save razorpay_order_id (fire-and-forget — doesn't block the response)
    admin.from('bookings').update({ razorpay_order_id: order.id }).eq('id', booking.id)
      .then(() => {}).catch((e: unknown) => console.error('razorpay_order_id update error:', e));

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
    await admin.from('bookings').update({ status: 'payment_failed', payment_status: 'failed' }).eq('id', booking.id);
    console.error('Razorpay order error:', e);
    return NextResponse.json({
      error: 'Payment gateway error. Please try again.',
      _debug: { message: e.message },
    }, { status: 500 });
  }
}

function handleMockBooking(params: {
  body: z.infer<typeof bodySchema>;
  startTs: Date;
  endTs: Date;
}) {
  const id = 'mock-booking-' + Date.now();
  const booking = {
    id,
    booking_number: 'ZDMOCK' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
    bike_id: params.body.bike_id,
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
