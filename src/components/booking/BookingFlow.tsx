'use client';

import { useMemo, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { PackagePicker } from './PackagePicker';
import { PickupTimePicker } from './PickupTimePicker';
import { AddonPicker } from './AddonPicker';
import { OrderSummary } from './OrderSummary';
import { RazorpayCheckout } from './RazorpayCheckout';
import {
  calculatePrice, tierEndTs, isWithinStoreHours,
  TIER_LABELS, TIER_HOURS,
  STORE_OPEN_HOUR, STORE_CLOSE_HOUR,
} from '@/lib/pricing';
import { formatDateTime } from '@/lib/utils';
import type { PackageTier } from '@/lib/supabase/types';
import type { AppliedCoupon } from './CouponInput';

type Bike = any;

// Map duration in hours to the closest available package tier
function tierFromHours(hrs: number): PackageTier {
  const tiers = Object.entries(TIER_HOURS) as Array<[PackageTier, number]>;
  return tiers.reduce<[PackageTier, number]>(
    (best, entry) => Math.abs(entry[1] - hrs) < Math.abs(best[1] - hrs) ? entry : best,
    tiers[0]
  )[0];
}

// Parse a local datetime string from URL params → Date, clamped to store hours
function pickupFromParam(fromStr: string): Date | null {
  if (!fromStr) return null;
  const d = new Date(fromStr); // no Z suffix → parsed as local time
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

export function BookingFlow({ bike, kycStatus, isLoggedIn = true }: { bike: Bike; kycStatus?: string | null; isLoggedIn?: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fromParam = searchParams.get('from') ?? '';
  const toParam   = searchParams.get('to')   ?? '';
  const signInHref = `/sign-in?redirectTo=${encodeURIComponent(pathname + (searchParams.toString() ? '?' + searchParams.toString() : ''))}`;

  // Pre-fill tier from the duration the user already selected on the homepage
  const [tier, setTier] = useState<PackageTier>(() => {
    if (fromParam && toParam) {
      const hrs = (new Date(toParam).getTime() - new Date(fromParam).getTime()) / 3_600_000;
      if (hrs > 0) return tierFromHours(hrs);
    }
    return '24hr';
  });

  // Pre-fill pickup time from the homepage search
  const [pickupTs, setPickupTs] = useState<Date | null>(() => {
    if (fromParam) {
      const d = pickupFromParam(fromParam);
      if (d) return d;
    }
    return defaultPickupTime();
  });

  const [extraHelmets, setExtraHelmets] = useState(0);
  const [mobileHolder, setMobileHolder] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endTs = useMemo(() => (pickupTs ? tierEndTs(pickupTs, tier) : null), [pickupTs, tier]);

  const breakdown = useMemo(() => {
    try {
      return calculatePrice({
        packages: bike.model.packages,
        tier,
        extraHelmetCount: extraHelmets,
        hasOriginalDL: true,
        includeMobileHolder: mobileHolder,
        couponDiscount: appliedCoupon?.discountAmount ?? 0,
      });
    } catch {
      return null;
    }
  }, [bike.model.packages, tier, extraHelmets, mobileHolder, appliedCoupon]);

  const pickupValid = pickupTs ? isWithinStoreHours(pickupTs) && pickupTs > new Date() : false;
  const canProceed = !!pickupTs && pickupValid && !!breakdown;
  const showKycNudge = kycStatus && kycStatus !== 'approved';

  return (
    <div className="grid md:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-5">
        {showKycNudge && (
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
        )}

        <Section number={1} title="Choose your package">
          <PackagePicker
            packages={bike.model.packages}
            value={tier}
            onChange={setTier}
          />
        </Section>

        <Section number={2} title="Pickup date & time">
          <PickupTimePicker value={pickupTs} onChange={setPickupTs} />
          {pickupTs && endTs && (
            <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Pickup</span>
                <span className="font-semibold">{formatDateTime(pickupTs)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted">Drop-off ({TIER_LABELS[tier]})</span>
                <span className="font-semibold">{formatDateTime(endTs)}</span>
              </div>
              {!pickupValid && (
                <div className="mt-2 text-xs text-danger">
                  ⚠️ Pickup must be within store hours (6 AM – 10 PM) and in the future
                </div>
              )}
            </div>
          )}
        </Section>

        <Section number={3} title="Add-ons">
          <AddonPicker
            extraHelmets={extraHelmets}
            onHelmetsChange={setExtraHelmets}
            mobileHolder={mobileHolder}
            onMobileHolderChange={setMobileHolder}
          />
        </Section>
      </div>

      {/* Right column — sticky order summary */}
      <div>
        <div className="md:sticky md:top-20">
          <OrderSummary
            bike={bike}
            breakdown={breakdown}
            pickupTs={pickupTs}
            endTs={endTs}
            tier={tier}
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
              tier={tier}
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
              <p className="text-sm text-muted">
                You need an account to book a bike.
              </p>
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

function Section({
  number, title, children,
}: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-accent text-white font-bold text-sm flex items-center justify-center">
          {number}
        </div>
        <h3 className="font-display font-semibold text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}
