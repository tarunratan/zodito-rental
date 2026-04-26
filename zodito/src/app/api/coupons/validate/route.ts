import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { computeCouponDiscount } from '@/lib/pricing';

export const runtime = 'nodejs';

const bodySchema = z.object({
  code: z.string().min(1).max(50),
  subtotal: z.number().positive(),
  gst_amount: z.number().min(0),
});

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
    .select('id, code, label, discount_type, discount_value, max_uses, used_count, expires_at, is_active')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();

  if (!coupon) {
    return NextResponse.json({ valid: false, error: 'Invalid coupon code' });
  }
  if (!coupon.is_active) {
    return NextResponse.json({ valid: false, error: 'This coupon is no longer active' });
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'This coupon has expired' });
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, error: 'This coupon has reached its usage limit' });
  }

  // Check if user already used this coupon
  const { data: existingUse } = await supabase
    .from('coupon_uses')
    .select('id')
    .eq('coupon_id', coupon.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingUse) {
    return NextResponse.json({ valid: false, error: 'You have already used this coupon' });
  }

  const discountAmount = computeCouponDiscount({
    discount_type: coupon.discount_type as any,
    discount_value: Number(coupon.discount_value),
    subtotal,
    gstAmount: gst_amount,
  });

  return NextResponse.json({
    valid: true,
    coupon: {
      code: coupon.code,
      label: coupon.label,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
    },
    discountAmount,
  });
}
