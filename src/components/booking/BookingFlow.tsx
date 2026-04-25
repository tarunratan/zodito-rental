'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PackagePicker } from './PackagePicker';
import { PickupTimePicker } from './PickupTimePicker';
import { AddonPicker } from './AddonPicker';
import { OrderSummary } from './OrderSummary';
import { RazorpayCheckout } from './RazorpayCheckout';
import { calculatePrice, tierEndTs, isWithinStoreHours, TIER_LABELS, STORE_OPEN_HOUR, STORE_CLOSE_HOUR, STORE_CLOSE_MIN } from '@/lib/pricing';
import { formatDateTime } from '@/lib/utils';
import type { PackageTier } from '@/lib/supabase/types';

type Bike = any;

function defaultPickupTime(): Date | null {
  const now = new Date();
  const target = new Date(now.getTime() + 60 * 60 * 1000); // +1hr
  const rawMin = target.getMinutes();
  let h = target.getHours();
  let m = 0;
  if (rawMin === 0) { m = 0; }
  else if (rawMin <= 30) { m = 30; }
  else { h = h + 1; m = 0; }
  if (h < STORE_OPEN_HOUR) { h = STORE_OPEN_HOUR; m = 0; }
  if (h > STORE_CLOSE_HOUR || (h === STORE_CLOSE_HOUR && m > STORE_CLOSE_MIN)) return null;
  return new Date(target.getFullYear(), target.getMonth(), target.getDate(), h, m, 0, 0);
}

export function BookingFlow({ bike, kycStatus }: { bike: Bike; kycStatus?: string | null }) {
  const [tier, setTier] = useState<PackageTier>('24hr');
  const [pickupTs, setPickupTs] = useState<Date | null>(defaultPickupTime);
  const [extraHelmets, setExtraHelmets] = useState(0);
  const [mobileHolder, setMobileHolder] = useState(false);
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
      });
    } catch {
      return null;
    }
  }, [bike.model.packages, tier, extraHelmets, mobileHolder]);

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
                <>You can book now, but <strong>upload your documents before pickup</strong> — bike won't be released without verified KYC.</>
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
                  ⚠️ Pickup must be within store hours (6 AM – 10:30 PM) and in the future
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
          />

          {error && (
            <div className="mt-3 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
              {error}
            </div>
          )}

          <RazorpayCheckout
            bikeId={bike.id}
            tier={tier}
            pickupTs={pickupTs}
            extraHelmets={extraHelmets}
            mobileHolder={mobileHolder}
            disabled={!canProceed}
            submitting={submitting}
            setSubmitting={setSubmitting}
            setError={setError}
            totalAmount={breakdown?.totalAmount ?? 0}
          />

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
