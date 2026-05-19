import { AdminNav } from '../AdminNav';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BikePricingManager } from './BikePricingManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  await requireAdmin();

  if (isMockMode()) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AdminNav />
        <p className="text-muted text-sm mt-4">Pricing editor not available in mock mode.</p>
      </div>
    );
  }

  const supabase = createSupabaseAdmin();
  // Pricing is an ADMIN surface — load every bike in the fleet, including
  // deactivated and pending-approval ones. The previous query mirrored the
  // customer-facing filters (`is_active = true`, `listing_status = approved`)
  // which silently hid bikes from the admin's own pricing screen. Admins need
  // to set / edit prices regardless of public-visibility state.
  // Visual badges in BikePricingManager flag inactive / unapproved listings.
  const { data: bikes } = await supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, registration_number,
      extra_km_rate, late_penalty_hour, is_active, listing_status,
      model:bike_models!inner(id, display_name, cc, packages:bike_model_packages(tier, price, km_limit)),
      bike_packages(tier, price, km_limit)
    `)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <AdminNav />
      <BikePricingManager initialBikes={bikes ?? []} isDebug={searchParams?.debug === '1'} />
    </div>
  );
}
