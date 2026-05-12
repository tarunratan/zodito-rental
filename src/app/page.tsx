import { Hero } from '@/components/home/Hero';
import { BrowseSection } from '@/components/home/BrowseSection';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import { mergeBikePackages } from '@/lib/pricing';

// Home page lists bike cards with prices. Force-dynamic + no-store so admin
// edits to tier prices / custom packages reach the homepage on the very next
// load — no 60s ISR window where 36hr / 2day / 3day overrides stay hidden.
export const dynamic = 'force-dynamic';

async function fetchBikes() {
  if (isMockMode()) return MOCK_BIKES;

  const supabase = createSupabaseAdmin();
  // Pull model packages, per-bike overrides, AND active custom packages in a
  // single round-trip via Supabase's relationship select. The merge step
  // below collapses model + overrides into the UNION the bike card needs.
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
      model:bike_models!inner(id, name, display_name, category, cc,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      bike_packages(tier, price, km_limit),
      custom_packages!custom_packages_bike_id_fkey(id, label, min_duration_hours, duration_hours, price, km_limit, is_active),
      vendor:vendors(id, business_name, pickup_area)
    `)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchBikes error:', error);
    return [];
  }

  // Merge per-bike overrides into `model.packages` (UNION semantics — see
  // `mergeBikePackages` for the rationale on why a left-join is wrong).
  // The home-page BikeCard reads `bike.model.packages` and `bike.custom_packages`,
  // so we collapse both sources onto the bike object here.
  return (data ?? []).map((bike: any) => {
    const overrides = (bike.bike_packages ?? []) as any[];
    const model     = bike.model;
    if (model) {
      model.packages = mergeBikePackages(model.packages ?? [], overrides);
    }
    return {
      ...bike,
      model,
      custom_packages: (bike.custom_packages ?? []).filter((p: any) => p.is_active),
    };
  });
}

export default async function HomePage() {
  const bikes = await fetchBikes();
  return (
    <>
      <Hero />
      <BrowseSection bikes={bikes as any} />
    </>
  );
}
