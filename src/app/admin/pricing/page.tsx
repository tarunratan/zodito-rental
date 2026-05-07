import { AdminNav } from '../AdminNav';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { BikePricingManager } from './BikePricingManager';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

export default async function AdminPricingPage() {
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
  const { data: bikes } = await supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, registration_number,
      extra_km_rate, late_penalty_hour,
      model:bike_models!inner(id, display_name, cc, packages:bike_model_packages(tier, price, km_limit)),
      bike_packages(tier, price, km_limit)
    `)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <AdminNav />
      <BikePricingManager initialBikes={bikes ?? []} />
    </div>
  );
}
