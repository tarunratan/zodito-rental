import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore, MOCK_BIKES } from '@/lib/mock';
import { AdminTabs } from '@/components/admin/AdminTabs';

export const dynamic = 'force-dynamic';

async function fetchAdminData() {
  if (isMockMode()) {
    return {
      stats: {
        pending_vendors: 2,
        pending_bikes: 3,
        pending_kyc: 1,
        active_bookings: mockBookingsStore.filter(b => ['confirmed', 'ongoing'].includes(b.status)).length,
      },
      vendors: [
        { id: 'mv1', business_name: 'Ravi Rentals', status: 'pending', contact_phone: '+919876543210', pickup_area: 'Kukatpally', pickup_address: 'Plot 42, Sai Nagar, Kukatpally, Hyd 500072', created_at: new Date(Date.now() - 3600000).toISOString(), user: { email: 'ravi@example.com', first_name: 'Ravi', last_name: 'Kumar' } },
        { id: 'mv2', business_name: 'Krishna Bikes', status: 'pending', contact_phone: '+919123456789', pickup_area: 'Miyapur', pickup_address: 'Shop 7, Main Road, Miyapur, Hyd 500049', created_at: new Date(Date.now() - 86400000).toISOString(), user: { email: 'krishna@example.com', first_name: 'Krishna', last_name: 'M' } },
      ],
      pending_bikes: [
        { id: 'pb1', emoji: '🏍️', color: 'Racing Green', year: 2023, registration_number: 'TS09EC5566', model: { display_name: 'Yamaha R15 V4', cc: 155 }, vendor: { business_name: 'Ravi Rentals' }, created_at: new Date(Date.now() - 7200000).toISOString() },
        { id: 'pb2', emoji: '🛵', color: 'Silver', year: 2022, registration_number: 'TS09EB1122', model: { display_name: 'Honda Activa 6G', cc: 110 }, vendor: { business_name: 'Krishna Bikes' }, created_at: new Date(Date.now() - 14400000).toISOString() },
      ],
      pending_kyc: [
        { id: 'k1', first_name: 'Arjun', last_name: 'Reddy', email: 'arjun@example.com', phone: '+919988776655', dl_number: 'TS0120230001234', kyc_submitted_at: new Date(Date.now() - 3600000).toISOString(), dl_photo_url: null, aadhaar_photo_url: null, selfie_with_dl_photo_url: null },
      ],
      bookings: mockBookingsStore.map(b => ({
        ...b,
        bike: MOCK_BIKES.find(k => k.id === b.bike_id),
        user: { first_name: 'Dev', last_name: 'User', phone: '+919000000000' },
        total_amount: 1500,
      })),
    };
  }

  const supabase = createSupabaseAdmin();

  const [statsData, vendors, pendingBikes, allBikes, kyc, bookings, models] = await Promise.all([
    supabase.rpc('admin_stats').maybeSingle().then(r => r.data).catch(() => null),
    supabase
      .from('vendors')
      .select('*, user:users!inner(email, first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('bikes')
      .select('*, model:bike_models!inner(id, display_name, cc), vendor:vendors(business_name)')
      .eq('listing_status', 'pending_approval')
      .order('created_at', { ascending: true }),
    supabase
      .from('bikes')
      .select('*, model:bike_models!inner(id, display_name, name, category, cc), vendor:vendors(id, business_name, pickup_area)')
      .order('created_at', { ascending: false }),
    supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, dl_number, kyc_status, kyc_submitted_at, dl_photo_url, aadhaar_photo_url, selfie_with_dl_photo_url, kyc_rejection_reason')
      .eq('kyc_status', 'pending')
      .order('kyc_submitted_at', { ascending: true }),
    supabase
      .from('bookings')
      .select(`
        id, booking_number, start_ts, end_ts, status, payment_status, total_amount, package_tier, created_at,
        bike:bikes!inner(id, emoji, owner_type, model:bike_models!inner(display_name)),
        user:users!inner(first_name, last_name, phone)
      `)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('bike_models')
      .select('id, name, display_name, category, cc')
      .order('category').order('cc'),
  ]);

  // Fallback stats if RPC doesn't exist
  const stats = statsData ?? {
    pending_vendors: vendors.data?.filter(v => v.status === 'pending').length ?? 0,
    pending_bikes: pendingBikes.data?.length ?? 0,
    pending_kyc: kyc.data?.length ?? 0,
    active_bookings: bookings.data?.filter(b => ['confirmed', 'ongoing'].includes(b.status)).length ?? 0,
  };

  return {
    stats,
    vendors: vendors.data ?? [],
    pending_bikes: pendingBikes.data ?? [],
    all_bikes: allBikes.data ?? [],
    bike_models: models.data ?? [],
    pending_kyc: kyc.data ?? [],
    bookings: bookings.data ?? [],
  };
}

export default async function AdminPage() {
  const user = await getCurrentAppUser();

  if (!isMockMode() && (!user || user.role !== 'admin')) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="text-5xl mb-3">🔒</div>
        <p className="font-semibold">Admin access required</p>
        <p className="text-muted text-sm mt-1">
          If you&apos;re an admin, run this in Supabase SQL editor:
        </p>
        <code className="inline-block mt-3 bg-primary text-white text-xs px-3 py-1.5 rounded-md">
          update users set role = &apos;admin&apos; where email = &apos;{user?.email || 'you@example.com'}&apos;;
        </code>
      </div>
    );
  }

  const data = await fetchAdminData();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
            Admin Panel
          </h1>
          <p className="text-muted text-sm mt-1">Manage vendors, listings, KYC, and bookings</p>
        </div>
        <Link href="/" className="text-sm text-muted hover:text-primary">Exit →</Link>
      </div>

      <AdminTabs data={data} />
    </div>
  );
}
