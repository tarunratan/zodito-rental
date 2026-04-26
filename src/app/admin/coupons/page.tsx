import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { CouponManager } from '@/components/admin/CouponManager';

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
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight">Admin Panel</h1>
          <p className="text-muted text-sm mt-1">Manage vendors, listings, KYC, and bookings</p>
        </div>
        <Link href="/" className="text-sm text-muted hover:text-primary">Exit →</Link>
      </div>

      {/* Nav tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        <Link href="/admin" className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted hover:text-primary -mb-px">
          Overview
        </Link>
        <Link href="/admin/coupons" className="px-4 py-2 text-sm font-medium border-b-2 border-accent text-accent -mb-px">
          Coupons
        </Link>
      </div>

      <CouponManager initialCoupons={coupons ?? []} />
    </div>
  );
}
