import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BookingsManager } from './BookingsManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  let bookings: any[] = [];
  let allBikes: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();

    const [rawBookingsRes, bikesRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, booking_number, status, payment_status, total_amount, base_price, gst_amount, security_deposit, package_tier, start_ts, end_ts, picked_up_at, returned_at, cancelled_at, cancellation_reason, razorpay_payment_id, final_km_used, excess_km_charge, damage_charge, notes, created_at, user_id, bike_id, source, customer_name, customer_phone')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('bikes')
        .select('id, emoji, registration_number, model_id')
        .eq('is_active', true)
        .eq('listing_status', 'approved')
        .order('created_at', { ascending: false }),
    ]);

    const rawBookings = rawBookingsRes.data ?? [];

    if (rawBookings.length > 0) {
      const bikeIds = [...new Set(rawBookings.map((b: any) => b.bike_id).filter(Boolean))];
      const userIds = [...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean))];

      const [bikesMapRes, usersRes] = await Promise.all([
        bikeIds.length ? supabase.from('bikes').select('id, registration_number, color, emoji, model_id').in('id', bikeIds) : Promise.resolve({ data: [] }),
        userIds.length ? supabase.from('users').select('id, email, first_name, last_name, phone').in('id', userIds) : Promise.resolve({ data: [] }),
      ]);

      const modelIds = [...new Set((bikesMapRes.data ?? []).map((b: any) => b.model_id).filter(Boolean))];
      const modelsRes = modelIds.length
        ? await supabase.from('bike_models').select('id, display_name').in('id', modelIds)
        : { data: [] };

      const modelMap = Object.fromEntries((modelsRes.data ?? []).map((m: any) => [m.id, m]));
      const bikeMap = Object.fromEntries((bikesMapRes.data ?? []).map((b: any) => [b.id, { ...b, model: modelMap[b.model_id] ?? null }]));
      const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));

      bookings = rawBookings.map((b: any) => ({
        ...b,
        bike: bikeMap[b.bike_id] ?? null,
        user: userMap[b.user_id] ?? null,
      }));
    } else {
      bookings = rawBookings;
    }

    // Get bike model names for the manual booking dropdown
    const allModelIds = [...new Set((bikesRes.data ?? []).map((b: any) => b.model_id).filter(Boolean))];
    const allModelsRes = allModelIds.length
      ? await supabase.from('bike_models').select('id, display_name').in('id', allModelIds)
      : { data: [] };
    const allModelMap = Object.fromEntries((allModelsRes.data ?? []).map((m: any) => [m.id, m]));
    allBikes = (bikesRes.data ?? []).map((b: any) => ({
      ...b,
      model: allModelMap[b.model_id] ?? null,
    }));
  }

  return <BookingsManager initialBookings={bookings} allBikes={allBikes} />;
}
