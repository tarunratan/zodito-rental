import { NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ coupons: [] });

  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: coupons } = await supabase
    .from('coupons')
    .select('id, code, label, discount_type, discount_value, max_uses, used_count, expires_at')
    .eq('is_active', true)
    .eq('is_public', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (!coupons) return NextResponse.json({ coupons: [] });

  type Coupon = typeof coupons[number];

  // Filter out maxed-out coupons
  const available = coupons.filter(
    (c: Coupon) => c.max_uses === null || c.used_count < c.max_uses
  );

  // Filter out coupons already used by this user
  const couponIds = available.map((c: Coupon) => c.id);
  if (couponIds.length === 0) return NextResponse.json({ coupons: [] });

  const { data: usedIds } = await supabase
    .from('coupon_uses')
    .select('coupon_id')
    .eq('user_id', user.id)
    .in('coupon_id', couponIds);

  const usedSet = new Set((usedIds ?? []).map((r: any) => r.coupon_id));
  const final = available.filter((c: Coupon) => !usedSet.has(c.id));

  return NextResponse.json({ coupons: final });
}
