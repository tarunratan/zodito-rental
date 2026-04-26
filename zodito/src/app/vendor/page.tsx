import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { VendorBikeList } from './VendorBikeList';
import { formatINR } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function VendorPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/sign-in');

  if (isMockMode()) {
    return <VendorDashboardShell pending bikes={[]} />;
  }

  const supabase = createSupabaseAdmin();

  // Get vendor record
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!vendor) redirect('/vendor/signup');

  if (vendor.status === 'pending') {
    return <VendorDashboardShell pending bikes={[]} vendorName={vendor.business_name} />;
  }

  if (vendor.status !== 'approved') {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="font-display font-bold text-2xl mb-2">Account {vendor.status}</h1>
        <p className="text-muted text-sm">Contact support at zoditorentals@gmail.com for help.</p>
      </div>
    );
  }

  // Fetch their bikes
  const { data: bikes } = await supabase
    .from('bikes')
    .select('*, model:bike_models(id, display_name, category, cc)')
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false });

  // Booking summary
  const bikeIds = (bikes ?? []).map(b => b.id);
  let totalEarnings = 0;
  let activeBookings = 0;
  if (bikeIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('vendor_payout, status')
      .in('bike_id', bikeIds);
    totalEarnings = (bookings ?? []).reduce((s, b) => s + (b.vendor_payout ?? 0), 0);
    activeBookings = (bookings ?? []).filter(b => b.status === 'confirmed' || b.status === 'ongoing').length;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl tracking-tight">Vendor Dashboard</h1>
        <p className="text-muted text-sm mt-1">{vendor.business_name} · {vendor.pickup_area}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <div className="text-2xl font-display font-bold text-accent">{(bikes ?? []).length}</div>
          <div className="text-xs text-muted mt-1">Bikes listed</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-display font-bold text-success">{activeBookings}</div>
          <div className="text-xs text-muted mt-1">Active bookings</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-display font-bold text-primary">{formatINR(totalEarnings)}</div>
          <div className="text-xs text-muted mt-1">Total earnings</div>
        </div>
      </div>

      {/* Bikes */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Your Bikes</h2>
        <Link href="/vendor/bikes/new" className="btn-accent text-sm px-4 py-2">
          + Add Bike
        </Link>
      </div>

      <VendorBikeList bikes={bikes ?? []} vendorId={vendor.id} />
    </div>
  );
}

function VendorDashboardShell({ pending, vendorName, bikes }: { pending: boolean; vendorName?: string; bikes: any[] }) {
  if (pending) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="font-display font-bold text-2xl mb-2">Application under review</h1>
        <p className="text-muted text-sm">
          {vendorName ? `${vendorName} — ` : ''}We review vendor applications within 24 hours. You'll be notified by email once approved.
        </p>
      </div>
    );
  }
  return null;
}
