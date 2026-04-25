import type { PackageTier } from '@/lib/pricing';
export interface Booking {
  id: string;
  booking_number: string;
  package_tier: PackageTier;
  km_limit: number;
  start_ts: string;
  end_ts: string;
  status: string;

  base_price?: number;
  extra_helmet_count?: number;
  extra_helmet_price?: number;
  subtotal?: number;
  gst_amount?: number;
  security_deposit?: number;
  total_amount?: number;

  bike: any; // keep loose for now (we’ll refine later if needed)
}
