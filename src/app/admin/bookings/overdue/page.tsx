import Link from 'next/link';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { OverdueBoard } from './OverdueBoard';

export const dynamic = 'force-dynamic';

/**
 * Overdue triage board. Surfaces every ongoing booking past its drop-off and
 * every confirmed booking past its pickup time — the two states where money
 * is leaking out the door. Each row has the SettlementComposer inline so the
 * operator can settle 5 bookings in a session without opening any modals.
 */
export default async function OverdueBookingsPage() {
  let bookings: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();

    // Opportunistic cleanup before reading — same pattern as the main list.
    try { await supabase.rpc('expire_unpaid_bookings'); } catch {}

    const { data: rawBookings } = await supabase
      .from('bookings')
      .select('id, booking_number, status, payment_status, total_amount, security_deposit, package_tier, km_limit, start_ts, end_ts, picked_up_at, returned_at, cancelled_at, cancellation_reason, razorpay_payment_id, notes, created_at, source, customer_name, customer_phone, alternate_phone, advance_paid, pending_amount, odometer_reading, helmets_provided, original_dl_taken, payment_method_detail, user_id, bike_id, handover_saved_at, handover_saved_by, base_price, gst_amount')
      .in('status', ['confirmed', 'ongoing'])
      .order('end_ts', { ascending: true })
      .limit(200);

    const now = Date.now();
    const overdueOnly = (rawBookings ?? []).filter((b: any) => {
      if (b.status === 'ongoing')   return new Date(b.end_ts).getTime()   < now;
      if (b.status === 'confirmed') return new Date(b.start_ts).getTime() < now;
      return false;
    });

    if (overdueOnly.length > 0) {
      const userIds = [...new Set(overdueOnly.map((b: any) => b.user_id).filter(Boolean))];
      const bikeIds = [...new Set(overdueOnly.map((b: any) => b.bike_id).filter(Boolean))];

      const [usersRes, bikesRes] = await Promise.all([
        userIds.length
          ? supabase.from('users').select('id, email, first_name, last_name, phone').in('id', userIds)
          : Promise.resolve({ data: [] }),
        bikeIds.length
          ? supabase.from('bikes').select('id, emoji, image_url, registration_number, color, model_id, extra_km_rate, late_penalty_hour').in('id', bikeIds)
          : Promise.resolve({ data: [] }),
      ]);

      const modelIds = [...new Set((bikesRes.data ?? []).map((b: any) => b.model_id).filter(Boolean))];
      const { data: modelsData } = modelIds.length
        ? await supabase.from('bike_models').select('id, display_name, cc, category, excess_km_rate, late_hourly_penalty').in('id', modelIds)
        : { data: [] };

      const userMap  = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
      const modelMap = Object.fromEntries((modelsData ?? []).map((m: any) => [m.id, m]));
      const bikeMap  = Object.fromEntries((bikesRes.data ?? []).map((b: any) => [b.id, { ...b, model: modelMap[b.model_id] ?? null }]));

      bookings = overdueOnly.map((b: any) => ({
        ...b,
        bike: bikeMap[b.bike_id] ?? null,
        user: userMap[b.user_id] ?? null,
      }));
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <Link href="/admin/bookings" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1">
          ← All bookings
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
          <div>
            <h1 className="font-display font-bold text-2xl">⏰ Overdue bookings</h1>
            <p className="text-sm text-muted mt-1">
              {bookings.length === 0
                ? 'Nothing overdue right now.'
                : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} need action. Negotiate the settlement amount and send the customer a Razorpay link — they pay before getting another day.`}
            </p>
          </div>
        </div>
      </div>

      <OverdueBoard initialBookings={bookings} />
    </div>
  );
}
