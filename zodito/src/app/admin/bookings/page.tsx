import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BookingsManager } from './BookingsManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  let bookings: any[] = [];
  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        user:users(id, email, first_name, last_name, phone),
        bike:bikes(id, registration_number, color, emoji, model:bike_models(display_name))
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    bookings = data ?? [];
  }

  return <BookingsManager initialBookings={bookings} />;
}
