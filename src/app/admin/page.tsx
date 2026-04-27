import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { AdminTabs } from '@/components/admin/AdminTabs';

export const dynamic = 'force-dynamic';

async function fetchAdminData() {
  if (isMockMode()) {
    return {
      stats: { pending_vendors: 2, pending_bikes: 3, pending_kyc: 1, active_bookings: 0 },
      vendors: [],
      pending_bikes: [],
      all_bikes: [],
      bike_models: [],
      pending_kyc: [],
      bookings: [],
    };
  }

  const supabase = createSupabaseAdmin();

  const [statsData, vendors, pendingBikes, allBikes, kyc, bookings, models] = await Promise.all([
    supabase.rpc('admin_stats').maybeSingle().then((r: any) => r.data).catch(() => null),
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

  const stats = statsData ?? {
    pending_vendors: vendors.data?.filter((v: any) => v.status === 'pending').length ?? 0,
    pending_bikes: pendingBikes.data?.length ?? 0,
    pending_kyc: kyc.data?.length ?? 0,
    active_bookings: bookings.data?.filter((b: any) => ['confirmed', 'ongoing'].includes(b.status)).length ?? 0,
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
  const data = await fetchAdminData();
  return <AdminTabs data={data} />;
}
