import type { PackageTier } from '@/lib/supabase/types';

export interface BookingPayloadArgs {
  bikeId: string;
  tier: PackageTier;
  customPackageId?: string;
  actualDays?: number;
  durationHours?: number;
  pickupTs: Date;
  extraHelmets: number;
  mobileHolder: boolean;
  couponCode: string | null;
  location: { lat: number; lng: number };
}

export function buildBookingPayload(
  args: BookingPayloadArgs,
  paymentType?: 'full' | 'partial'
) {
  return {
    bike_id: args.bikeId,
    ...(args.customPackageId ? { custom_package_id: args.customPackageId } : { tier: args.tier }),
    ...(args.actualDays ? { actual_days: args.actualDays } : {}),
    ...(args.customPackageId && args.durationHours
      ? { duration_hours: Math.round(args.durationHours) }
      : {}),
    start_ts: args.pickupTs.toISOString(),
    extra_helmet_count: args.extraHelmets,
    mobile_holder: args.mobileHolder,
    booking_lat: args.location.lat,
    booking_lng: args.location.lng,
    ...(args.couponCode ? { coupon_code: args.couponCode } : {}),
    ...(paymentType ? { payment_method: 'online', payment_type: paymentType } : {}),
  };
}
