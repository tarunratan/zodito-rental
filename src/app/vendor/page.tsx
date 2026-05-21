import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore, MOCK_BIKES } from '@/lib/mock';
import { VendorDashboard } from '@/components/vendor/VendorDashboard';

export const dynamic = 'force-dynamic';

/**
 * Vendor portal — strictly for vendor users.
 *
 *   • Signed-out visitors → /vendor/signup (public entry point).
 *   • Admin users → /admin/vendors (their proper management surface).
 *     The old "preview any vendor" mode was removed because it confused
 *     admins (they were inside a read-only view that LOOKED interactive)
 *     and made the auth boundary fuzzy. Full vendor CRUD lives in admin.
 *   • Vendors (status='approved') → their own dashboard with KPIs,
 *     bikes list, snapshot strip and bookings table.
 *   • Pending/rejected vendor accounts → /vendor/signup so they finish
 *     onboarding or see the rejection reason.
 */
async function fetchVendorData(userId: string) {
  if (isMockMode()) {
    const myBikes = MOCK_BIKES.filter(b => b.owner_type === 'vendor');
    const myBookings = mockBookingsStore.filter(b => myBikes.some(bike => bike.id === b.bike_id));
    return {
      vendor: { id: 'v-mock', business_name: 'Mock Vendor Store', status: 'approved', commission_pct: 20, pickup_area: 'Kukatpally' },
      bikes: myBikes,
      bookings: myBookings.map(b => ({
        ...b, bike: myBikes.find(k => k.id === b.bike_id),
        total_amount: 1500, vendor_payout: 1040, platform_commission: 460,
      })),
    };
  }

  const supabase = createSupabaseAdmin();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!vendor) return null;

  const { data: bikes } = await supabase
    .from('bikes')
    .select(`
      id, emoji, listing_status, is_active, registration_number, color, year,
      model:bike_models!inner(display_name, cc)
    `)
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false });

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_number, start_ts, end_ts, package_tier, status, payment_status,
      total_amount, platform_commission, vendor_payout, base_price, created_at,
      bike:bikes!inner(id, emoji, model:bike_models!inner(display_name)),
      user:users!inner(first_name, last_name, phone, email)
    `)
    .in('bike_id', (bikes ?? []).map((b: { id: string }) => b.id))
    .order('start_ts', { ascending: false });

  return { vendor, bikes: bikes ?? [], bookings: bookings ?? [] };
}

export default async function VendorPortalPage() {
  const user = await getCurrentAppUser();

  // Public entry — signed-out visitors land on signup.
  if (!user) redirect('/vendor/signup');

  // Admins get a dedicated CRUD surface; this portal is for vendors only.
  if (user.role === 'admin') redirect('/admin/vendors');

  const data = await fetchVendorData(user.id);
  // No vendor row yet → finish onboarding.
  if (!data) redirect('/vendor/signup');
  // Pending / rejected / suspended → signup screen handles the state copy.
  if (data.vendor.status !== 'approved') redirect('/vendor/signup');

  return <VendorDashboard data={data} />;
}
