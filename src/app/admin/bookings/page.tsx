import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BookingsManager } from './BookingsManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  let bookings: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();

    // Opportunistic cleanup — flip stale pending_payment rows past their
    // deadline to payment_failed before reading. expire_unpaid_bookings()
    // is the canonical helper; nothing was calling it on read paths, which
    // is why 10-day-old "Awaiting Payment" rows were lingering on the UI.
    try { await supabase.rpc('expire_unpaid_bookings'); } catch {}

    // Batch 1 (parallel): bookings + ALL bikes (one shot covers both mapping and dropdown)
    const [rawBookingsRes, allBikesRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, booking_number, status, payment_status, total_amount, base_price, gst_amount, security_deposit, package_tier, km_limit, start_ts, end_ts, picked_up_at, returned_at, cancelled_at, cancellation_reason, razorpay_payment_id, final_km_used, excess_km_charge, damage_charge, notes, created_at, user_id, bike_id, source, customer_name, customer_phone, alternate_phone, advance_paid, pending_amount, odometer_reading, helmets_provided, original_dl_taken, payment_method_detail, payment_proof_url, booking_lat, booking_lng, booking_ip, kyc_dl_front_url, kyc_dl_back_url, kyc_aadhaar_front_url, kyc_aadhaar_back_url, kyc_selfie_url, handover_saved_at, handover_saved_by')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('bikes')
        .select('id, emoji, image_url, registration_number, color, model_id, extra_km_rate, late_penalty_hour, is_active, listing_status')
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
        ? supabase.from('bike_models').select('id, display_name, category, cc, excess_km_rate, late_hourly_penalty').in('id', modelIds)
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
  }

  return <BookingsManager initialBookings={bookings} />;
}
