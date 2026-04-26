import { Hero } from '@/components/home/Hero';
import { BrowseSection } from '@/components/home/BrowseSection';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';

export const revalidate = 60; // cache the bike list for 60s

async function fetchBikes() {
  if (isMockMode()) return MOCK_BIKES;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
      model:bike_models!inner(id, name, display_name, category, cc,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      vendor:vendors(id, business_name, pickup_area)
    `)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchBikes error:', error);
    return [];
  }
  return data ?? [];
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
