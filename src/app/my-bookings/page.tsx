import Link from 'next/link';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore, MOCK_BIKES } from '@/lib/mock';
import { BookingCard } from '@/components/bookings/BookingCard';
import { SuccessToast } from '@/components/bookings/SuccessToast';

export const dynamic = 'force-dynamic';

async function fetchBookings(userId: string) {
  if (isMockMode()) {
    // Hydrate mock bookings with their bike info
    return mockBookingsStore.map(b => ({
      ...b,
      bike: MOCK_BIKES.find(k => k.id === b.bike_id),
    }));
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, booking_number, start_ts, end_ts, package_tier, status, payment_status,
      base_price, extra_helmet_count, subtotal, gst_amount, security_deposit, total_amount,
      km_limit, created_at, payment_deadline,
      bike:bikes!inner(
        id, emoji, image_url, color, color_hex, owner_type,
        model:bike_models!inner(display_name, cc),
        vendor:vendors(business_name, pickup_area, pickup_address, contact_phone)
      )
    `)
    .eq('user_id', userId)
    .order('start_ts', { ascending: false });

  if (error) {
    console.error('fetchBookings error:', error);
    return [];
  }
  return data ?? [];
}

export default async function MyBookingsPage({
  searchParams,
}: { searchParams: { success?: string } }) {
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p>Please sign in to view your bookings.</p>
      </div>
    );
  }

  const bookings = await fetchBookings(user.id) as any[];

  const upcoming = bookings.filter(b => ['pending_payment', 'confirmed', 'ongoing'].includes(b.status));
  const past = bookings.filter(b => ['completed', 'cancelled', 'payment_failed'].includes(b.status));

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {searchParams.success && <SuccessToast />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
            My Bookings
          </h1>
          <p className="text-muted text-sm mt-1">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/" className="btn-accent text-sm">+ New Booking</Link>
      </div>

      {bookings.length === 0 && (
        <div className="text-center py-20 bg-white rounded-card border border-border">
          <div className="text-5xl mb-3">🛵</div>
          <p className="font-semibold text-lg">No bookings yet</p>
          <p className="text-muted text-sm mt-1 mb-5">Pick your ride and get started</p>
          <Link href="/" className="btn-accent">Browse bikes</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display font-semibold text-lg mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map(b => <BookingCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-lg mb-3">Past</h2>
          <div className="space-y-3">
            {past.map(b => <BookingCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
