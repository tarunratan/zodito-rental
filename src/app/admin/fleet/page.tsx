import { createSupabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { AdminNav } from '../AdminNav';
import { FleetDashboard } from './FleetDashboard';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminFleetPage() {
  await requireAdmin();

  if (isMockMode()) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AdminNav />
        <p className="text-muted text-sm mt-4">Fleet dashboard not available in mock mode.</p>
      </div>
    );
  }

  const supabase = createSupabaseAdmin();

  const [activeBookingsRes, allBikesRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, booking_number, status, payment_status, total_amount, base_price,
        gst_amount, security_deposit, package_tier, start_ts, end_ts,
        picked_up_at, returned_at, source, customer_name, customer_phone,
        razorpay_payment_id, notes, bike_id, user_id, created_at
      `)
      .in('status', ['confirmed', 'ongoing'])
      .order('end_ts', { ascending: true }),
    supabase
      .from('bikes')
      .select(`
        id, emoji, image_url, color, registration_number, owner_type,
        frozen_from, frozen_until, freeze_reason,
        model:bike_models!inner(display_name, cc)
      `)
      .eq('is_active', true)
      .eq('listing_status', 'approved')
      .order('created_at', { ascending: false }),
  ]);

  const rawBookings = activeBookingsRes.data ?? [];
  const bikes = allBikesRes.data ?? [];

  // Fetch users for the active bookings
  const userIds = [...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean))];
  const usersRes = userIds.length
    ? await supabase
        .from('users')
        .select('id, first_name, last_name, phone, email')
        .in('id', userIds)
    : { data: [] };

  const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
  const bikeMap = Object.fromEntries(bikes.map((b: any) => [b.id, b]));

  const activeBookings = rawBookings.map((b: any) => ({
    ...b,
    user: userMap[b.user_id] ?? null,
    bike: bikeMap[b.bike_id] ?? null,
  }));

  // Mark which bikes are currently booked
  const bookedBikeIds = new Set(activeBookings.map((b: any) => b.bike_id));
  const now = new Date();
  const frozenBikeIds = new Set(
    bikes
      .filter((b: any) => b.frozen_from && b.frozen_until &&
        new Date(b.frozen_from) <= now && new Date(b.frozen_until) >= now)
      .map((b: any) => b.id)
  );

  const fleetBikes = bikes.map((b: any) => {
    const booking = activeBookings.find((bk: any) => bk.bike_id === b.id) ?? null;
    let fleetStatus: 'available' | 'confirmed' | 'ongoing' | 'overdue' | 'frozen' = 'available';
    if (frozenBikeIds.has(b.id)) fleetStatus = 'frozen';
    else if (booking?.status === 'ongoing' && new Date(booking.end_ts) < now) fleetStatus = 'overdue';
    else if (booking?.status === 'ongoing') fleetStatus = 'ongoing';
    else if (booking?.status === 'confirmed') fleetStatus = 'confirmed';
    return { ...b, fleetStatus, booking };
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <AdminNav />
      <FleetDashboard
        fleetBikes={fleetBikes}
        activeBookings={activeBookings}
        allBikes={bikes.map((b: any) => ({
          id: b.id,
          emoji: b.emoji,
          registration_number: b.registration_number,
          model: b.model,
        }))}
      />
    </div>
  );
}
