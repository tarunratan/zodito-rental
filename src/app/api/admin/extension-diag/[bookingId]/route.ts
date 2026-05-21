/**
 * Admin-only diagnostic for booking extensions — answers:
 *
 *   "Customer asked for an extension. What did the backend compute, and why?"
 *
 * Mirrors /api/bookings/[id]/extend/quote but with no auth coupling to a
 * specific user, no Razorpay side-effect, and a fuller breakdown so the
 * operator can validate pricing in support cases.
 *
 * Usage:
 *   GET /api/admin/extension-diag/<booking_id>?new_end_ts=2026-05-25T14:00:00+05:30
 *
 *   new_end_ts is required. Either an ISO timestamp or a YYYY-MM-DDTHH:mm
 *   local string (IST). Pick a future drop-off you want to evaluate.
 *
 * Returns the same fields the customer quote returns, PLUS the raw inputs
 * fed to quoteExtension(), so admins can diff against what the customer
 * sees and figure out which package matched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { quoteExtension } from '@/lib/extension-pricing';
import { findConflictingBooking } from '@/lib/booking-overlap';
import { mergeBikePackages, type CustomPackage, isWithinStoreHours } from '@/lib/pricing';
import { istLocalToUtcIso } from '@/lib/datetime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(req: NextRequest, { params }: { params: { bookingId: string } }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: NO_STORE });
  }

  const rawEnd = req.nextUrl.searchParams.get('new_end_ts');
  if (!rawEnd) {
    return NextResponse.json({
      error: 'new_end_ts query param is required',
      example: `/api/admin/extension-diag/${params.bookingId}?new_end_ts=2026-05-25T14:00:00`,
    }, { status: 400, headers: NO_STORE });
  }

  // Accept either an ISO timestamp or a bare local-IST string. Falls back to
  // the IST-normalised ISO when the input lacks a timezone.
  const iso = /T\d{2}:\d{2}(:\d{2})?$/.test(rawEnd) ? istLocalToUtcIso(rawEnd) : rawEnd;
  const newEndTs = new Date(iso ?? rawEnd);
  if (isNaN(newEndTs.getTime())) {
    return NextResponse.json({ error: 'Invalid new_end_ts — pass ISO or YYYY-MM-DDTHH:mm' }, { status: 400, headers: NO_STORE });
  }

  const admin = createSupabaseAdmin();

  const { data: booking } = await admin
    .from('bookings')
    .select(`
      id, booking_number, user_id, status, start_ts, end_ts, km_limit, base_price, gst_amount, bike_id,
      bike:bikes!inner(
        id, registration_number, late_penalty_hour, extra_km_rate,
        model:bike_models!inner(id, display_name, late_hourly_penalty, excess_km_rate, packages:bike_model_packages(tier, price, km_limit))
      )
    `)
    .eq('id', params.bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404, headers: NO_STORE });

  const [{ data: overrides }, { data: customPkgs }] = await Promise.all([
    admin.from('bike_packages').select('tier, price, km_limit').eq('bike_id', booking.bike_id),
    admin.from('custom_packages').select('*').eq('bike_id', booking.bike_id).eq('is_active', true),
  ]);

  const modelPkgs = ((booking.bike as any)?.model?.packages ?? []) as Array<{ tier: any; price: number; km_limit: number }>;
  const mergedPackages = mergeBikePackages(modelPkgs as any, (overrides ?? []) as any);
  const availableTiers = mergedPackages.map(p => p.tier);

  const quoteInput = {
    startTs: new Date(booking.start_ts),
    originalEndTs: new Date(booking.end_ts),
    newEndTs,
    originalBasePrice: Number(booking.base_price ?? 0),
    originalGstAmount: Number(booking.gst_amount ?? 0),
    originalKmLimit: Number(booking.km_limit ?? 0),
    availableTiers,
    packages: mergedPackages,
    customPackages: (customPkgs ?? []) as CustomPackage[],
  };

  const quote = quoteExtension(quoteInput);

  // Late penalty — same math the customer create/quote routes apply.
  const nowMs = Date.now();
  const endMs = new Date(booking.end_ts).getTime();
  const hoursOverdue = Math.max(0, Math.ceil((nowMs - endMs) / 3_600_000));
  const latePenaltyRate = Number(
    (booking.bike as any)?.late_penalty_hour ??
    (booking.bike as any)?.model?.late_hourly_penalty ??
    49,
  );
  const latePenalty = hoursOverdue * latePenaltyRate;

  // Availability check — same overlap query the customer flow runs.
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

  // Extra hours for transparency in the report. Cannot use the quote field
  // because it might be the error branch.
  const requestedExtraHours = (newEndTs.getTime() - new Date(booking.end_ts).getTime()) / 3_600_000;

  return NextResponse.json({
    booking: {
      id: booking.id,
      booking_number: booking.booking_number,
      status: booking.status,
      start_ts: booking.start_ts,
      end_ts: booking.end_ts,
      base_price: booking.base_price,
      gst_amount: booking.gst_amount,
      km_limit: booking.km_limit,
    },
    bike: {
      id: (booking.bike as any)?.id,
      registration: (booking.bike as any)?.registration_number,
      model_name: (booking.bike as any)?.model?.display_name,
      late_penalty_hour: (booking.bike as any)?.late_penalty_hour,
      extra_km_rate: (booking.bike as any)?.extra_km_rate,
    },
    inputs: {
      requested_new_end_ts: newEndTs.toISOString(),
      requested_extra_hours: Number(requestedExtraHours.toFixed(2)),
      requested_extra_days_ceil: Math.ceil(requestedExtraHours / 24),
      within_store_hours: isWithinStoreHours(newEndTs),
      available_tiers: availableTiers,
      model_packages_count: modelPkgs.length,
      override_packages_count: (overrides ?? []).length,
      custom_packages_count: (customPkgs ?? []).length,
    },
    pricing: {
      packages_merged: mergedPackages,
      custom_packages: customPkgs ?? [],
      quote,
      late_penalty: {
        hours_overdue: hoursOverdue,
        rate_per_hour: latePenaltyRate,
        amount: latePenalty,
        applied_when: 'now > original_end_ts (folded into base_delta in /extend/create)',
      },
      total_payable: 'error' in (quote as any)
        ? null
        : (quote as any).totalDelta + latePenalty,
      gst_policy: 'gstDelta is forced to 0 — extensions are GST-waived (see extension-pricing.ts)',
    },
    availability: {
      candidates_checked: candidates?.length ?? 0,
      conflict: conflict ? {
        booking_id: conflict.id,
        booking_number: conflict.booking_number,
        status: conflict.status,
        start_ts: conflict.start_ts,
        end_ts: conflict.end_ts,
      } : null,
    },
  }, { headers: NO_STORE });
}
