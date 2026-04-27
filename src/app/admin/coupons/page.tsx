import { createSupabaseAdmin } from '@/lib/supabase/server';
import { CouponManager } from '@/components/admin/CouponManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  let coupons: any[] = [];
  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    coupons = data ?? [];
  }

  return <CouponManager initialCoupons={coupons} />;
}
