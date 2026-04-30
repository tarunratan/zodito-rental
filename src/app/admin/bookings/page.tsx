import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BookingsManager } from './BookingsManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  let bookings: any[] = [];
  let allBikes: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();

    // Batch 1 (parallel): bookings + ALL bikes (one shot covers both mapping and dropdown)
    const [rawBookingsRes, allBikesRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, booking_number, status, payment_status, total_amount, base_price, gst_amount, security_deposit, package_tier, start_ts, end_ts, picked_up_at, returned_at, cancelled_at, cancellation_reason, razorpay_payment_id, final_km_used, excess_km_charge, damage_charge, notes, created_at, user_id, bike_id, source, customer_name, customer_phone, booking_lat, booking_lng, booking_ip')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('bikes')
        .select('id, emoji, registration_number, color, model_id, is_active, listing_status')
        .order('created_at', { ascending: false }),
    ]);

    const rawBookings = rawBookingsRes.data ?? [];
    const allBikesData = allBikesRes.data ?? [];

    // Batch 2 (parallel): users for bookings + models for bikes — no sequential dependency
    const userIds = [...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean))];
    const modelIds = [...new Set(allBikesData.map((b: any) => b.model_id).filter(Boolean))];

    const [usersRes, modelsRes] = await Promise.all([
      userIds.length
        ? supabase.from('users').select('id, email, first_name, last_name, phone').in('id', userIds)
        : Promise.resolve({ data: [] }),
      modelIds.length
        ? supabase.from('bike_models').select('id, display_name').in('id', modelIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Build in-memory maps — zero DB calls from here
    const modelMap = Object.fromEntries((modelsRes.data ?? []).map((m: any) => [m.id, m]));
    const bikeMap = Object.fromEntries(
      allBikesData.map((b: any) => [b.id, { ...b, model: modelMap[b.model_id] ?? null }])
    );
    const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));

    bookings = rawBookings.map((b: any) => ({
      ...b,
      bike: bikeMap[b.bike_id] ?? null,
      user: userMap[b.user_id] ?? null,
    }));

    // Dropdown: only active+approved bikes with model names
    allBikes = allBikesData
      .filter((b: any) => b.is_active && b.listing_status === 'approved')
      .map((b: any) => ({ ...b, model: modelMap[b.model_id] ?? null }));
  }

  return <BookingsManager initialBookings={bookings} allBikes={allBikes} />;
}
