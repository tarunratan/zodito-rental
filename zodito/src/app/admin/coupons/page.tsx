import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AdminCouponManager } from './AdminCouponManager';
import { AdminNav } from '../AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') redirect('/');

  const supabase = createSupabaseAdmin();
  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-4">
        <h1 className="font-display font-bold text-2xl tracking-tight">Admin Panel</h1>
        <p className="text-muted text-sm mt-1">Manage bikes, vendors, and listings</p>
      </div>
      <AdminNav />
      <AdminCouponManager initialCoupons={coupons ?? []} />
    </div>
  );
}
