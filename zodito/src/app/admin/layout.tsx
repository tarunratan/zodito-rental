import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AdminNav } from './AdminNav';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') redirect('/');

  let kycPending = 0;
  let vendorPending = 0;
  let activeBookings = 0;

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const [kycRes, vendorRes, bookingRes] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['confirmed', 'ongoing']),
    ]);
    kycPending = kycRes.count ?? 0;
    vendorPending = vendorRes.count ?? 0;
    activeBookings = bookingRes.count ?? 0;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-4">
        <h1 className="font-display font-bold text-2xl tracking-tight">Admin Panel</h1>
        <p className="text-muted text-sm mt-1">Manage your rental business</p>
      </div>
      <AdminNav kycPending={kycPending} vendorPending={vendorPending} activeBookings={activeBookings} />
      {children}
    </div>
  );
}
