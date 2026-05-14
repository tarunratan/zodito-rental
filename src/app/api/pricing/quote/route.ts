/**
 * Server-authoritative pricing quote endpoint.
 *
 * Customers and the BookingFlow component call this on every pickup/drop-off
 * change. The endpoint is force-dynamic AND returns `Cache-Control: no-store`,
 * so neither Next.js, the browser, nor any CDN can serve a stale quote.
 *
 * Returns the same shape the client computes locally so the UI can replace
 * its in-memory breakdown atomically. Five mandatory debug log lines are
 * emitted on every call so price-mismatch issues are diagnosable from the
 * server console alone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import {
  STANDARD_RANGES, coveringTier, calculatePrice,
  type CustomPackage, type PackageTier,
} from '@/lib/pricing';
import { getBikeState } from '@/lib/bike-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE: HeadersInit = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bikeId       = searchParams.get('bike_id');
    const pickupParam  = searchParams.get('pickup_ts');
    const dropoffParam = searchParams.get('dropoff_ts');
    const extraHelmets = parseInt(searchParams.get('extra_helmets') ?? '0', 10) || 0;
    const mobileHolder = searchParams.get('mobile_holder') === '1';

    if (!bikeId || !pickupParam || !dropoffParam) {
      return bad('bike_id, pickup_ts and dropoff_ts are required');
    }

    const pickupTs  = new Date(pickupParam);
    const dropoffTs = new Date(dropoffParam);
    if (isNaN(pickupTs.getTime()) || isNaN(dropoffTs.getTime())) {
      return bad('Invalid pickup_ts or dropoff_ts');
    }
    if (dropoffTs.getTime() <= pickupTs.getTime()) {
      return bad('Drop-off must be strictly after pickup');
    }

    // Exact floating-point hours in UTC — no premature rounding.
    const durationHours = (dropoffTs.getTime() - pickupTs.getTime()) / 3_600_000;

    // ── MANDATORY DEBUG LOGS (1 & 2) ────────────────────────────────────────
    console.log(`LOG: [Raw Pickup/Dropoff] -> Pickup: ${pickupTs.toISOString()}, Dropoff: ${dropoffTs.toISOString()}`);
    console.log(`LOG: [Calculated Booking Duration] -> Total Hours: ${durationHours.toFixed(2)} hours`);

    // ── Mock-mode shortcut ──────────────────────────────────────────────────
    if (isMockMode()) {
      const bike = MOCK_BIKES.find(b => b.id === bikeId);
      if (!bike) return bad('Bike not found', 404);
      const packages = (bike as any).model?.packages ?? [];
      const availableTiers: PackageTier[] = packages.map((p: any) => p.tier);
      console.log(`LOG: [Fetched Admin Ranges] -> Active Ranges Found:`, { standard_tiers: availableTiers, bike_overrides: [], custom_packages: [] });
      const tierResult = coveringTier(durationHours, availableTiers, []);
      if (!tierResult) {
        console.log(`LOG: [Selected Range Match] -> Matched Range ID: NONE`);
        return NextResponse.json({ error: 'No package available for this duration', durationHours }, { status: 200, headers: NO_STORE });
      }
      const breakdown = tierResult.type === 'custom'
        ? calculatePrice({ customPackage: tierResult.pkg, customActualHours: durationHours, extraHelmetCount: extraHelmets, hasOriginalDL: true, includeMobileHolder: mobileHolder })
        : calculatePrice({ packages, tier: tierResult.tier, actualDays: tierResult.actualDays, extraHelmetCount: extraHelmets, hasOriginalDL: true, includeMobileHolder: mobileHolder });
      logSelectedRange(tierResult, durationHours);
      console.log(`LOG: [Final Output Price] -> Base Rate: ${breakdown.basePrice}, Total calculated: ${breakdown.totalAmount}`);
      return NextResponse.json({
        durationHours: Number(durationHours.toFixed(4)),
        tier: tierResult.type === 'standard' ? tierResult.tier : null,
        actualDays: tierResult.type === 'standard' ? tierResult.actualDays : undefined,
        customPackageId: tierResult.type === 'custom' ? tierResult.pkg.id : undefined,
        customPackageLabel: tierResult.type === 'custom' ? tierResult.pkg.label : undefined,
        matchedRange: rangeDescriptor(tierResult),
        breakdown,
        computedAt: new Date().toISOString(),
      }, { headers: NO_STORE });
    }

    // Canonical state lookup (migration 040) — single source of truth for
    // every consumer of bike availability + merged packages. Replaces the
    // previous three-query merge-in-JS pattern so this endpoint can never
    // disagree with the home list or detail page on what packages exist.
    const state = await getBikeState(bikeId, pickupTs, dropoffTs);
    if (!state) return bad('Bike not found', 404);

    const packages = state.packages;
    const customPackages: CustomPackage[] = state.custom_packages as CustomPackage[];
    const availableTiers: PackageTier[] = packages.map(p => p.tier);

    // ── MANDATORY DEBUG LOG (3) ─────────────────────────────────────────────
    console.log(`LOG: [Fetched Admin Ranges] -> Active Ranges Found:`, {
      standard_tiers: availableTiers.map(t => {
        const r = STANDARD_RANGES.find(s => s.tier === t);
        const pkg = packages.find(p => p.tier === t);
        return { tier: t, min: r?.min ?? null, max: r?.max ?? null, price: pkg?.price ?? null, km_limit: pkg?.km_limit ?? null };
      }),
      custom_packages: customPackages.map(c => ({
        id: c.id, label: c.label,
        min: c.min_duration_hours, max: c.duration_hours,
        price: Number(c.price), km_limit: c.km_limit,
        per_day_price: c.per_day_price ?? null,
      })),
    });

    const tierResult = coveringTier(durationHours, availableTiers, customPackages);

    // ── MANDATORY DEBUG LOG (4) ─────────────────────────────────────────────
    if (!tierResult) {
      console.log(`LOG: [Selected Range Match] -> Matched Range ID: NONE`);
      return NextResponse.json({
        error: 'No admin-configured range covers this duration. Adjust the dates or add a tier.',
        durationHours: Number(durationHours.toFixed(4)),
      }, { status: 200, headers: NO_STORE });
    }
    logSelectedRange(tierResult, durationHours);

    const breakdown = tierResult.type === 'custom'
      ? calculatePrice({
          customPackage: tierResult.pkg,
          customActualHours: durationHours,
          extraHelmetCount: extraHelmets,
          hasOriginalDL: true,
          includeMobileHolder: mobileHolder,
        })
      : calculatePrice({
          packages: packages as any,
          tier: tierResult.tier,
          actualDays: tierResult.actualDays,
          extraHelmetCount: extraHelmets,
          hasOriginalDL: true,
          includeMobileHolder: mobileHolder,
        });

    // ── MANDATORY DEBUG LOG (5) ─────────────────────────────────────────────
    console.log(`LOG: [Final Output Price] -> Base Rate: ${breakdown.basePrice}, Total calculated: ${breakdown.totalAmount}`);

    return NextResponse.json({
      durationHours: Number(durationHours.toFixed(4)),
      tier:                  tierResult.type === 'standard' ? tierResult.tier        : null,
      actualDays:            tierResult.type === 'standard' ? tierResult.actualDays  : undefined,
      customPackageId:       tierResult.type === 'custom'   ? tierResult.pkg.id      : undefined,
      customPackageLabel:    tierResult.type === 'custom'   ? tierResult.pkg.label   : undefined,
      matchedRange: rangeDescriptor(tierResult),
      breakdown,
      computedAt: new Date().toISOString(),
    }, { headers: NO_STORE });
  } catch (e: any) {
    console.error('[pricing/quote] error', e);
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500, headers: NO_STORE });
  }
}

function rangeDescriptor(tierResult: ReturnType<typeof coveringTier>): { id: string; min: number; max: number } | null {
  if (!tierResult) return null;
  if (tierResult.type === 'custom') {
    return { id: tierResult.pkg.id, min: tierResult.pkg.min_duration_hours, max: tierResult.pkg.duration_hours };
  }
  const r = STANDARD_RANGES.find(s => s.tier === tierResult.tier);
  const idLabel = tierResult.actualDays && tierResult.actualDays > 1
    ? `${tierResult.tier}×${tierResult.actualDays}d`
    : tierResult.tier;
  return { id: idLabel, min: r?.min ?? 0, max: r?.max ?? 0 };
}

function logSelectedRange(tierResult: NonNullable<ReturnType<typeof coveringTier>>, durationHours: number) {
  const d = rangeDescriptor(tierResult);
  if (d) {
    console.log(`LOG: [Selected Range Match] -> Matched Range ID: ${d.id} (Min: ${d.min}, Max: ${d.max}) for duration=${durationHours.toFixed(2)}h`);
  }
}
