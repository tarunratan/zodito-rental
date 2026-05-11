import { NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isCouponUsable, type CouponRecord } from '@/lib/coupon-eligibility';

export const runtime = 'nodejs';

const COUPON_COLS =
  'id, code, label, discount_type, discount_value, max_uses, used_count, ' +
  'expires_at, active_from, is_active, usage_scope, ' +
  'time_window_start, time_window_end, valid_weekdays';

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ coupons: [] });

  const supabase = createSupabaseAdmin();

  // Fetch all currently-public active coupons. Window / scope eligibility is
  // applied in JS against `isCouponUsable` so the rules live in one place.
  const { data: rawCoupons } = await supabase
    .from('coupons')
    .select(COUPON_COLS)
    .eq('is_active', true)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  const coupons = (rawCoupons ?? []) as unknown as CouponRecord[];
  if (coupons.length === 0) return NextResponse.json({ coupons: [] });

  // Per-user context: which of these has the user already redeemed, and
  // does the user have any prior non-cancelled bookings?
  const [{ data: usedRows }, { data: priorBookings }] = await Promise.all([
    supabase
      .from('coupon_uses')
      .select('coupon_id')
      .eq('user_id', user.id)
      .in('coupon_id', coupons.map(c => c.id)),
    supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id)
      .not('status', 'in', '(cancelled,payment_failed)')
      .limit(1),
  ]);

  const usedSet = new Set((usedRows ?? []).map((r: any) => r.coupon_id));
  const hasPriorBookings = (priorBookings?.length ?? 0) > 0;
  const now = new Date();

  const final = coupons.filter(c =>
    isCouponUsable(
      c,
      { hasUsedBefore: usedSet.has(c.id), hasPriorBookings },
      now,
    ).eligible,
  );

  return NextResponse.json({ coupons: final });
}
