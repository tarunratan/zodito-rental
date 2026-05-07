import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import {
  calculatePrice,
  tierEndTs,
  isWithinStoreHours,
  effectiveModelIdForDate,
  splitCommission,
  computeCouponDiscount,
} from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';
import type { CustomPackage } from '@/lib/pricing';

// Edge runtime: no cold start, runs at the network edge closest to the user.
// Supabase JS client uses native fetch — fully Edge-compatible.
export const runtime = 'edge';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const ALL_TIERS = [
  '6hr','12hr','24hr','36hr','48hr','60hr','72hr','96hr','120hr','144hr',
  '2day','3day','7day','15day','30day','weekly_flex','monthly_flex',
] as const;

const bodySchema = z.object({
  bike_id: z.string(),
  tier: z.enum(ALL_TIERS).optional(),
  custom_package_id: z.string().uuid().optional(),
  actual_days: z.number().int().min(2).max(29).optional(),
  duration_hours: z.number().int().min(1).max(8760).optional(),
  start_ts: z.string(),
  extra_helmet_count: z.number().int().min(0).max(3).default(0),
  mobile_holder: z.boolean().default(false),
  coupon_code: z.string().optional(),
  booking_lat: z.number(),
  booking_lng: z.number(),
}).refine(d => d.tier || d.custom_package_id, { message: 'tier or custom_package_id required' });

// Decode JWT payload locally (no network) — used only to extract `sub` (auth_id)
// so we can fire the users-table lookup in parallel with auth.getUser().
// Signature is verified by admin.auth.getUser() running concurrently.
function decodeJwtSub(token: string): string | null {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Auth token comes from the client via Authorization header
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Please sign in to book' }, { status: 401 });
  }

  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid request: ' + parse.error.message }, { status: 400 });
  }
  const body = parse.data;

  const startTs = new Date(body.start_ts);
  // Placeholder endTs for standard tiers; replaced after custom package lookup
  const prelimEndTs = body.tier
    ? tierEndTs(startTs, body.tier as PackageTier, body.actual_days)
    : new Date(startTs.getTime() + 24 * 3_600_000);

  if (startTs <= new Date()) {
    return NextResponse.json({ error: 'Pickup time must be in the future' }, { status: 400 });
  }
  if (!isWithinStoreHours(startTs)) {
    return NextResponse.json(
      { error: 'Pickup time must be within store hours (6 AM – 10:30 PM)' },
      { status: 400 }
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pre-decode JWT to get auth_id — lets us fire the users.select in parallel
  // with admin.auth.getUser() without waiting for the auth call to complete first.
  const authIdFromToken = decodeJwtSub(token);
  if (!authIdFromToken) {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  // --- SINGLE ROUND-TRIP: auth verify + bike + user_id + coupon + custom pkg all fire at once
  const couponPromise = body.coupon_code
    ? admin
        .from('coupons')
        .select('id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active')
        .eq('code', body.coupon_code.toUpperCase().trim())
        .maybeSingle()
    : Promise.resolve({ data: null });

  const customPkgPromise = body.custom_package_id
    ? admin.from('custom_packages').select('*').eq('id', body.custom_package_id).eq('bike_id', body.bike_id).eq('is_active', true).maybeSingle()
    : Promise.resolve({ data: null });

  const [authResult, bikeResult, userResult, couponResult, customPkgResult] = await Promise.all([
    admin.auth.getUser(token),
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
    admin.from('users').select('id').eq('auth_id', authIdFromToken).maybeSingle(),
    couponPromise,
    customPkgPromise,
  ]);

  // Validate auth — admin.auth.getUser() is the authoritative check
  if (authResult.error || !authResult.data.user) {
    return NextResponse.json({ error: 'Please sign in to book' }, { status: 401 });
  }
  // Tamper check: decoded sub must match the verified user
  if (authResult.data.user.id !== authIdFromToken) {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  if (!bikeResult.data) {
    return NextResponse.json({ error: 'Bike not available for booking' }, { status: 404 });
  }

  if (!userResult.data) {
    return NextResponse.json({ error: 'User account not found — please contact support' }, { status: 401 });
  }

  const customPkg = customPkgResult.data as CustomPackage | null;
  if (body.custom_package_id && !customPkg) {
    return NextResponse.json({ error: 'Custom package not found or inactive' }, { status: 404 });
  }

  const bike = bikeResult.data as any;
  const userId = userResult.data.id as string;

  let resolvedEndTs: Date;
  if (customPkg) {
    const dh = body.duration_hours ?? customPkg.duration_hours;
    if (dh < (customPkg.min_duration_hours ?? 0) || dh > customPkg.duration_hours) {
      return NextResponse.json({ error: 'Booking duration is outside the package range' }, { status: 400 });
    }
    resolvedEndTs = new Date(startTs.getTime() + dh * 3_600_000);
  } else {
    resolvedEndTs = prelimEndTs;
  }

  // Freeze window check
  if (bike.frozen_from && bike.frozen_until) {
    const frozenFrom = new Date(bike.frozen_from);
    const frozenUntil = new Date(bike.frozen_until);
    if (frozenFrom < resolvedEndTs && frozenUntil > startTs) {
      return NextResponse.json(
        { error: `This bike is under maintenance until ${frozenUntil.toLocaleString('en-IN')}${bike.freeze_reason ? '. Reason: ' + bike.freeze_reason : ''}` },
        { status: 409 }
      );
    }
  }

  // Weekend override — local day-of-week check first; only fetches if actually needed
  const model = bike.model as any;
  const effectiveModelId = effectiveModelIdForDate(model, startTs);
  let packages = model.packages;

  // Coupon validation
  const c = couponResult.data as any;
  const couponValid = c && c.is_active &&
    !(c.expires_at && new Date(c.expires_at) < new Date()) &&
    !(c.max_uses !== null && c.used_count >= c.max_uses);

  // Second parallel batch — only fires if weekend override OR coupon needs checking
  if (effectiveModelId !== model.id || couponValid) {
    const [weekendResult, couponUsedResult] = await Promise.all([
      effectiveModelId !== model.id
        ? admin.from('bike_model_packages').select('tier, price, km_limit').eq('model_id', effectiveModelId)
        : Promise.resolve({ data: null }),
      couponValid
        ? admin.from('coupon_uses').select('id').eq('coupon_id', c.id).eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (weekendResult.data) packages = weekendResult.data;
    if (couponValid && couponUsedResult.data) {
      // Coupon already used — proceed without discount
      (c as any).already_used = true;
    }
  }

  let couponRow: { id: string; code: string; discount_type: string; discount_value: number } | null = null;
  if (couponValid && !(c as any).already_used) {
    couponRow = { id: c.id, code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value) };
  }

  // Price calculation — pure, no I/O
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

  // Commission split
  let platform_commission = breakdown.basePrice + breakdown.extraHelmetCharge;
  let vendor_payout = 0;
  if (bike.owner_type === 'vendor') {
    const commissionPct = bike.vendor?.commission_pct ?? 20;
    const split = splitCommission({ basePrice: breakdown.basePrice, extraHelmetCharge: breakdown.extraHelmetCharge, commissionPct });
    platform_commission = split.platformCommission;
    vendor_payout = split.vendorPayout;
  }

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

  // --- FINAL INSERT — exclusion constraint handles double-booking atomically
  const { data: booking, error: insertErr } = await admin
    .from('bookings')
    .insert({
      user_id: userId,
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
      advance_paid: 0,
      pending_amount: breakdown.totalAmount,
      payment_method_detail: 'cash',
      status: 'confirmed',
      payment_status: 'pending',
      booking_ip: clientIp,
      booking_lat: body.booking_lat,
      booking_lng: body.booking_lng,
    })
    .select('id, booking_number')
    .single();

  if (insertErr) {
    if (insertErr.code === '23P01') {
      return NextResponse.json(
        { error: 'This bike was just booked for that time. Please try a different pickup time.' },
        { status: 409 }
      );
    }
    console.error('Cash booking insert error:', insertErr);
    return NextResponse.json({ error: 'Could not create booking. Please try again.' }, { status: 500 });
  }

  // Coupon usage tracking — fire-and-forget, never blocks the response
  if (couponRow && breakdown.couponDiscount > 0) {
    void admin.from('coupon_uses').insert({
      coupon_id: couponRow.id, user_id: userId, booking_id: booking.id, discount_amount: breakdown.couponDiscount,
    }).then(() => admin.rpc('increment_coupon_used_count', { p_coupon_id: couponRow!.id }));
  }

  return NextResponse.json({
    booking_id: booking.id,
    booking_number: booking.booking_number,
  });
}
