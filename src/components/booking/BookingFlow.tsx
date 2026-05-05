'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { PickupTimePicker } from './PickupTimePicker';
import { ReturnTimePicker } from './ReturnTimePicker';
import { AddonPicker } from './AddonPicker';
import { OrderSummary } from './OrderSummary';
import { RazorpayCheckout } from './RazorpayCheckout';
import {
  calculatePrice, tierEndTs, isWithinStoreHours,
  TIER_LABELS, isFlexTier, coveringTier, formatDuration,
  STORE_OPEN_HOUR, STORE_CLOSE_HOUR,
} from '@/lib/pricing';
import type { CustomPackage, TierResult } from '@/lib/pricing';
import { formatDateTime } from '@/lib/utils';
import type { PackageTier } from '@/lib/supabase/types';
import type { AppliedCoupon } from './CouponInput';

type Bike = any;

function pickupFromParam(fromStr: string): Date | null {
  if (!fromStr) return null;
  const d = new Date(fromStr);
  if (isNaN(d.getTime()) || d <= new Date()) return null;
  let h = d.getHours();
  if (d.getMinutes() >= 30) h = Math.min(h + 1, STORE_CLOSE_HOUR);
  if (h < STORE_OPEN_HOUR) h = STORE_OPEN_HOUR;
  if (h > STORE_CLOSE_HOUR) h = STORE_OPEN_HOUR;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
}

function defaultPickupTime(): Date | null {
  const now = new Date();
  let h = now.getMinutes() > 0 ? now.getHours() + 2 : now.getHours() + 1;
  if (h < STORE_OPEN_HOUR) h = STORE_OPEN_HOUR;
  if (h > STORE_CLOSE_HOUR) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0);
}

export function BookingFlow({
  bike,
  kycStatus,
  isLoggedIn = true,
  customPackages = [],
}: {
  bike: Bike;
  kycStatus?: string | null;
  isLoggedIn?: boolean;
  customPackages?: CustomPackage[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fromParam = searchParams.get('from') ?? '';
  const toParam   = searchParams.get('to')   ?? '';
  const signInHref = `/sign-in?redirectTo=${encodeURIComponent(pathname + (searchParams.toString() ? '?' + searchParams.toString() : ''))}`;

  const hasSearchParams = !!(fromParam && toParam);
  const [expandedForm, setExpandedForm] = useState(false);
  const quickMode = hasSearchParams && !expandedForm;

  const [pickupTs, setPickupTs] = useState<Date | null>(() => {
    if (fromParam) {
      const d = pickupFromParam(fromParam);
      if (d) return d;
    }
    return defaultPickupTime();
  });

  const [returnTs, setReturnTs] = useState<Date | null>(() => {
    if (toParam) {
      const d = new Date(toParam);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  });

  // Clear returnTs if it is now before the minimum (pickupTs + 12hrs)
  useEffect(() => {
    if (pickupTs && returnTs && returnTs < new Date(pickupTs.getTime() + 12 * 3_600_000)) {
      setReturnTs(null);
    }
  }, [pickupTs]); // eslint-disable-line react-hooks/exhaustive-deps

  const [extraHelmets, setExtraHelmets] = useState(0);
  const [mobileHolder, setMobileHolder] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTiers = useMemo<PackageTier[]>(
    () => bike.model.packages.map((p: any) => p.tier),
    [bike.model.packages]
  );

  const durationHours = useMemo(
    () => pickupTs && returnTs ? (returnTs.getTime() - pickupTs.getTime()) / 3_600_000 : 0,
    [pickupTs, returnTs]
  );

  const tierResult = useMemo<TierResult | null>(
    () => durationHours > 0 ? coveringTier(durationHours, availableTiers, customPackages) : null,
    [durationHours, availableTiers, customPackages]
  );

  // Derive pricing inputs from the tier result
  const isCustom   = tierResult?.type === 'custom';
  const tier       = tierResult?.type === 'standard' ? tierResult.tier   : null;
  const actualDays = tierResult?.type === 'standard' ? tierResult.actualDays : undefined;
  const isFlex     = tier ? isFlexTier(tier) : false;
  const customPkg  = tierResult?.type === 'custom'   ? tierResult.pkg    : null;

  const endTs = useMemo(() => {
    if (!pickupTs || !tierResult) return null;
    if (tierResult.type === 'standard') return tierEndTs(pickupTs, tierResult.tier, tierResult.actualDays);
    return new Date(pickupTs.getTime() + tierResult.pkg.duration_hours * 3_600_000);
  }, [pickupTs, tierResult]);

  const breakdown = useMemo(() => {
    if (!tierResult) return null;
    try {
      if (tierResult.type === 'custom') {
        return calculatePrice({
          customPackage: tierResult.pkg,
          extraHelmetCount: extraHelmets,
          hasOriginalDL: true,
          includeMobileHolder: mobileHolder,
          couponDiscount: appliedCoupon?.discountAmount ?? 0,
        });
      }
      return calculatePrice({
        packages: bike.model.packages,
        tier: tierResult.tier,
        actualDays: isFlex ? tierResult.actualDays : undefined,
        extraHelmetCount: extraHelmets,
        hasOriginalDL: true,
        includeMobileHolder: mobileHolder,
        couponDiscount: appliedCoupon?.discountAmount ?? 0,
      });
    } catch {
      return null;
    }
  }, [bike.model.packages, tierResult, isFlex, extraHelmets, mobileHolder, appliedCoupon]);

  const pickupValid      = pickupTs ? isWithinStoreHours(pickupTs) && pickupTs > new Date() : false;
  const noPackage        = !!tierResult && !breakdown;
  const durationTooLong  = durationHours > 720;
  const durationTooShort = durationHours > 0 && durationHours < 12;
  const canProceed       = !!pickupTs && pickupValid && !!returnTs && !!tierResult && !!breakdown;

  const showKycNudge = kycStatus && kycStatus !== 'approved';

  const kycBanner = showKycNudge && (
    <div className={`rounded-xl border-2 p-4 ${
      kycStatus === 'rejected'
        ? 'bg-danger/8 border-danger text-danger'
        : 'bg-amber-50 border-amber-400 text-amber-900'
    }`}>
      <div className="flex items-center gap-2 font-bold text-sm mb-1">
        <span className="text-lg">{kycStatus === 'rejected' ? '🚫' : '⚠️'}</span>
        {kycStatus === 'rejected' ? 'KYC Rejected — Action Required' : 'KYC Verification Needed'}
      </div>
      <p className="text-sm leading-snug">
        {kycStatus === 'not_submitted' && (
          <>You can book now, but <strong>upload your documents before pickup</strong> — bike won&apos;t be released without verified KYC.</>
        )}
        {kycStatus === 'pending' && (
          <>Your documents are under review. You&apos;re good to book — we&apos;ll verify before handover.</>
        )}
        {kycStatus === 'rejected' && (
          <>Your previous submission was rejected. <strong>Re-submit before pickup</strong> or your booking may be cancelled.</>
        )}
      </p>
      {(kycStatus === 'not_submitted' || kycStatus === 'rejected') && (
        <Link
          href="/kyc"
          className={`inline-block mt-2 text-sm font-semibold underline ${kycStatus === 'rejected' ? 'text-danger' : 'text-amber-800'}`}
        >
          {kycStatus === 'rejected' ? 'Re-submit KYC →' : 'Upload documents →'}
        </Link>
      )}
    </div>
  );

  const durationBanner = (() => {
    if (!pickupTs || !returnTs) return null;
    if (durationTooShort) return (
      <div className="p-3 bg-danger/8 border border-danger/30 rounded-lg text-sm text-danger">
        Minimum booking is 12 hours. Please select a later return time.
      </div>
    );
    if (durationTooLong) return (
      <div className="p-3 bg-danger/8 border border-danger/30 rounded-lg text-sm text-danger">
        Maximum booking is 30 days. Please select an earlier return date.
      </div>
    );
    if (noPackage) return (
      <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm">
        No package available for this duration. Please adjust your dates or ask the operator.
      </div>
    );
    if (tierResult && endTs) {
      const pkgLabel = isCustom && customPkg
        ? customPkg.label
        : tier ? TIER_LABELS[tier] : '';
      return (
        <div className="p-3.5 bg-accent/5 border border-accent/20 rounded-lg text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted">Your trip</span>
            <span className="font-semibold">{formatDuration(durationHours)}</span>
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-muted">Package</span>
            <span className="font-semibold text-accent">
              {pkgLabel}
              {isCustom && <span className="ml-1.5 text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-bold">Custom</span>}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-muted">Return by</span>
            <span className="font-semibold">{formatDateTime(endTs)}</span>
          </div>
        </div>
      );
    }
    return null;
  })();

  const packageLabel = (isCustom && customPkg)
    ? customPkg.label
    : tier ? TIER_LABELS[tier] : '—';

  return (
    <div className="grid md:grid-cols-[1fr_380px] gap-6">

      {/* ── Left column ── */}
      {quickMode ? (
        <div className="space-y-5">
          {kycBanner}

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-lg">Your trip details</h3>
              <button onClick={() => setExpandedForm(true)} className="text-sm text-accent underline hover:no-underline">
                Change
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {tierResult && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted">Package</span>
                  <span className="font-semibold text-accent">{packageLabel}</span>
                </div>
              )}
              {durationHours > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted">Duration</span>
                  <span className="font-semibold">{formatDuration(durationHours)}</span>
                </div>
              )}
              {breakdown && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted">Included KM</span>
                  <span className="font-semibold">{breakdown.kmLimit.toLocaleString('en-IN')} km</span>
                </div>
              )}
              {pickupTs && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted">Pickup</span>
                  <span className="font-semibold">{formatDateTime(pickupTs)}</span>
                </div>
              )}
              {endTs && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted">Return by</span>
                  <span className="font-semibold">{formatDateTime(endTs)}</span>
                </div>
              )}
            </div>
            {!pickupValid && pickupTs && (
              <div className="mt-3 text-xs text-danger bg-danger/8 rounded-lg p-2.5">
                ⚠️ Pickup must be within store hours (6 AM – 10 PM) and in the future.{' '}
                <button onClick={() => setExpandedForm(true)} className="underline font-semibold">Change time →</button>
              </div>
            )}
          </div>

          <Section number={1} title="Add-ons">
            <AddonPicker
              extraHelmets={extraHelmets} onHelmetsChange={setExtraHelmets}
              mobileHolder={mobileHolder} onMobileHolderChange={setMobileHolder}
            />
          </Section>
        </div>
      ) : (
        <div className="space-y-5">
          {kycBanner}

          <Section number={1} title="Pickup date & time">
            <PickupTimePicker value={pickupTs} onChange={setPickupTs} />
            {pickupTs && !pickupValid && (
              <div className="mt-2 text-xs text-danger">
                ⚠️ Pickup must be within store hours (6 AM – 10 PM) and in the future
              </div>
            )}
          </Section>

          <Section number={2} title="Return date & time">
            {!pickupTs ? (
              <p className="text-sm text-muted">Select a pickup time first.</p>
            ) : (
              <ReturnTimePicker pickupTs={pickupTs} value={returnTs} onChange={setReturnTs} />
            )}
            {durationBanner && <div className="mt-4">{durationBanner}</div>}
          </Section>

          <Section number={3} title="Add-ons">
            <AddonPicker
              extraHelmets={extraHelmets} onHelmetsChange={setExtraHelmets}
              mobileHolder={mobileHolder} onMobileHolderChange={setMobileHolder}
            />
          </Section>
        </div>
      )}

      {/* ── Right column ── */}
      <div>
        <div className="md:sticky md:top-20">
          <OrderSummary
            bike={bike}
            breakdown={breakdown}
            pickupTs={pickupTs}
            endTs={endTs}
            packageLabel={packageLabel}
            appliedCoupon={appliedCoupon}
            onCouponApply={setAppliedCoupon}
          />

          {error && (
            <div className="mt-3 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
              {error}
            </div>
          )}

          {isLoggedIn ? (
            <RazorpayCheckout
              bikeId={bike.id}
              tier={tier ?? '24hr'}
              customPackageId={customPkg?.id}
              actualDays={isFlex ? actualDays : undefined}
              pickupTs={pickupTs}
              extraHelmets={extraHelmets}
              mobileHolder={mobileHolder}
              couponCode={appliedCoupon?.code ?? null}
              disabled={!canProceed}
              submitting={submitting}
              setSubmitting={setSubmitting}
              setError={setError}
              totalAmount={breakdown?.totalAmount ?? 0}
            />
          ) : (
            <div className="mt-4 p-4 border-2 border-accent/30 rounded-xl text-center space-y-3">
              <p className="text-sm text-muted">You need an account to book a bike.</p>
              <Link
                href={signInHref}
                className="block w-full py-3 bg-accent text-white font-semibold rounded-xl text-base hover:bg-accent/90 transition-colors"
              >
                Sign in to Book →
              </Link>
              <p className="text-xs text-muted">
                No account?{' '}
                <Link href={`/sign-up?redirectTo=${encodeURIComponent(pathname + (searchParams.toString() ? '?' + searchParams.toString() : ''))}`} className="text-accent underline">
                  Create one free
                </Link>
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted text-center mt-3 leading-relaxed">
            By booking, you agree to our rental policy. Security deposit is paid by cash/UPI at pickup and refunded after drop-off.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-accent text-white font-bold text-sm flex items-center justify-center">{number}</div>
        <h3 className="font-display font-semibold text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}
