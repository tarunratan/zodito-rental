import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AdminCouponManager } from './AdminCouponManager';

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const supabase = createSupabaseAdmin();
  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  return <AdminCouponManager initialCoupons={coupons ?? []} />;
}
