'use client';

import { useMemo, useState } from 'react';
import { PackagePicker } from './PackagePicker';
import { PickupTimePicker } from './PickupTimePicker';
import { AddonPicker } from './AddonPicker';
import { OrderSummary } from './OrderSummary';
import { RazorpayCheckout } from './RazorpayCheckout';
import { calculatePrice, tierEndTs, isWithinStoreHours, TIER_LABELS } from '@/lib/pricing';
import { formatDateTime } from '@/lib/utils';
import type { PackageTier } from '@/lib/supabase/types';

type Bike = any;

export function BookingFlow({ bike }: { bike: Bike }) {
  const [tier, setTier] = useState<PackageTier>('24hr');
  const [pickupTs, setPickupTs] = useState<Date | null>(null);
  const [extraHelmets, setExtraHelmets] = useState(0);
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
      });
    } catch {
      return null;
    }
  }, [bike.model.packages, tier, extraHelmets]);

  const pickupValid = pickupTs ? isWithinStoreHours(pickupTs) && pickupTs > new Date() : false;
  const canProceed = !!pickupTs && pickupValid && !!breakdown;

  return (
    <div className="grid md:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-5">
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
            disabled={!canProceed}
            submitting={submitting}
            setSubmitting={setSubmitting}
            setError={setError}
            totalAmount={breakdown?.totalAmount ?? 0}
          />

          <p className="text-[11px] text-muted text-center mt-3 leading-relaxed">
            By booking, you agree to our rental policy. Security deposit is
            refunded after drop-off.
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
