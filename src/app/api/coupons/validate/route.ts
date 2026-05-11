import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { computeCouponDiscount } from '@/lib/pricing';
import { isCouponUsable, type CouponRecord } from '@/lib/coupon-eligibility';

export const runtime = 'nodejs';

const bodySchema = z.object({
  code: z.string().min(1).max(50),
  subtotal: z.number().positive(),
  gst_amount: z.number().min(0),
});

const COUPON_COLS =
  'id, code, label, discount_type, discount_value, max_uses, used_count, ' +
  'expires_at, active_from, is_active, usage_scope, ' +
  'time_window_start, time_window_end, valid_weekdays';

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ valid: false, error: 'Please sign in to apply a coupon' }, { status: 401 });
  }

  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 400 });
  }
  const { code, subtotal, gst_amount } = parse.data;

  const supabase = createSupabaseAdmin();
  const { data: coupon } = await supabase
    .from('coupons')
    .select(COUPON_COLS)
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();

  if (!coupon) return NextResponse.json({ valid: false, error: 'Invalid coupon code' });

  const c = coupon as unknown as CouponRecord;

  // Per-user context: previous redemption + prior bookings.
  const [{ data: existingUse }, { data: priorBookings }] = await Promise.all([
    supabase
      .from('coupon_uses')
      .select('id')
      .eq('coupon_id', c.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id)
      .not('status', 'in', '(cancelled,payment_failed)')
      .limit(1),
  ]);

  const verdict = isCouponUsable(
    c,
    {
      hasUsedBefore: !!existingUse,
      hasPriorBookings: (priorBookings?.length ?? 0) > 0,
    },
  );
  if (!verdict.eligible) {
    return NextResponse.json({ valid: false, error: verdict.reason ?? 'Coupon not applicable' });
  }

  const discountAmount = computeCouponDiscount({
    discount_type: c.discount_type as any,
    discount_value: Number(c.discount_value),
    subtotal,
    gstAmount: gst_amount,
  });

  return NextResponse.json({
    valid: true,
    coupon: {
      code: c.code,
      label: c.label,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      usage_scope: c.usage_scope ?? 'one_per_user',
    },
    discountAmount,
  });
}
