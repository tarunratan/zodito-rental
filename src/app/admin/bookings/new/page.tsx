import Link from 'next/link';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { ManualBookingForm } from './ManualBookingForm';

export const dynamic = 'force-dynamic';

export default async function NewManualBookingPage() {
  let allBikes: any[] = [];

  if (!isMockMode()) {
    const supabase = createSupabaseAdmin();
    const [bikesRes, modelsRes] = await Promise.all([
      supabase
        .from('bikes')
        .select('id, emoji, image_url, registration_number, color, model_id, is_active, listing_status')
        .order('created_at', { ascending: false }),
      supabase.from('bike_models').select('id, display_name'),
    ]);
    const modelMap = Object.fromEntries((modelsRes.data ?? []).map((m: any) => [m.id, m]));
    allBikes = (bikesRes.data ?? [])
      .filter((b: any) => b.is_active && b.listing_status === 'approved')
      .map((b: any) => ({ ...b, model: modelMap[b.model_id] ?? null }));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <Link href="/admin/bookings" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1">
          ← Back to bookings
        </Link>
        <h1 className="font-display font-bold text-2xl mt-1">New offline booking</h1>
        <p className="text-sm text-muted mt-1">
          Capture a walk-in / phone booking. KYC and payment proof uploads are optional —
          save now and add them later from the booking detail page.
        </p>
      </div>

      <ManualBookingForm allBikes={allBikes} />
    </div>
  );
}
