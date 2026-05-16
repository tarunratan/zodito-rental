import { Hero } from '@/components/home/Hero';
import { BrowseSection } from '@/components/home/BrowseSection';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import { mergeBikePackages } from '@/lib/pricing';

// Home page lists bike cards with prices. Force-dynamic + no-store so admin
// edits to tier prices / custom packages reach the homepage on the very next
// load — no ISR window where 36hr / 2day / 3day overrides stay hidden.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

async function fetchBikes() {
  if (isMockMode()) return MOCK_BIKES;

  const supabase = createSupabaseAdmin();

  // 1) Bikes + model-level packages only. We DELIBERATELY do not use a
  //    PostgREST relationship-select for `bike_packages` / `custom_packages`
  //    here: if any auto-detected or hinted FK name disagrees with the
  //    production schema, the entire bikes query errors out and the home
  //    page shows zero cards. Splitting the queries makes the override /
  //    custom-package fetches strictly additive — the bike list always
  //    renders even if those side fetches fail.
  const bikesRes = await supabase
    .from('bikes')
    .select(`
      id, emoji, image_url, color, color_hex, year, total_rides, rating_avg, rating_count, owner_type,
      is_active,is_frozen, listing_status,
      model:bike_models!inner(id, name, display_name, category, cc,
        packages:bike_model_packages(tier, price, km_limit)
      ),
      vendor:vendors(id, business_name, pickup_area)
    `)
    .eq('is_frozen', false)
    .eq('is_active', true)
    .eq('listing_status', 'approved')
    .order('created_at', { ascending: false });

  if (bikesRes.error) {
    console.error('[home.fetchBikes] bikes query failed:', bikesRes.error);
    return [];
  }
  // Defense-in-depth: post-query safety pass identical to /api/bikes/available.
  // If the SQL filter ever lets through a row that shouldn't be customer-visible,
  // this catches it and logs loudly.
  const rawBikes = bikesRes.data ?? [];
  const bikes: any[] = [];
  const dropped: Array<{ id: string; reason: string }> = [];
  for (const b of rawBikes) {
    if ((b as any).is_active === false) { dropped.push({ id: b.id, reason: 'is_active=false' }); continue; }
    if ((b as any).listing_status && (b as any).listing_status !== 'approved') {
      dropped.push({ id: b.id, reason: `listing_status=${(b as any).listing_status}` });
      continue;
    }
    bikes.push(b);
  }
  if (dropped.length > 0) {
    console.warn('[home.fetchBikes] post-query safety pass dropped', dropped.length, 'bike(s):', dropped);
  }
  if (bikes.length === 0) return [];

  // 2) Fetch overrides + custom packages for ALL bikes in two parallel
  //    queries scoped by `bike_id IN (...)`. This is identical to what
  //    /api/admin/pricing-diag does per-bike — proven to work.
  const bikeIds = bikes.map((b: any) => b.id);
  const [overridesRes, customsRes] = await Promise.all([
    supabase
      .from('bike_packages')
      .select('bike_id, tier, price, km_limit')
      .in('bike_id', bikeIds),
    supabase
      .from('custom_packages')
      .select('bike_id, id, label, min_duration_hours, duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active')
      .in('bike_id', bikeIds)
      .eq('is_active', true),
  ]);
  if (overridesRes.error) console.error('[home.fetchBikes] bike_packages query failed:', overridesRes.error);
  if (customsRes.error)   console.error('[home.fetchBikes] custom_packages query failed:', customsRes.error);

  // 3) Group overrides + customs by bike_id, then merge into each bike.
  const overridesByBike = new Map<string, any[]>();
  for (const o of (overridesRes.data ?? [])) {
    const arr = overridesByBike.get(o.bike_id) ?? [];
    arr.push({ tier: o.tier, price: o.price, km_limit: o.km_limit });
    overridesByBike.set(o.bike_id, arr);
  }
  const customsByBike = new Map<string, any[]>();
  for (const c of (customsRes.data ?? [])) {
    const arr = customsByBike.get(c.bike_id) ?? [];
    arr.push(c);
    customsByBike.set(c.bike_id, arr);
  }

  return bikes.map((bike: any) => {
    const overrides = overridesByBike.get(bike.id) ?? [];
    const customs   = customsByBike.get(bike.id)   ?? [];
    const model     = bike.model;
    if (model) {
      model.packages = mergeBikePackages(model.packages ?? [], overrides);
    }
    return { ...bike, model, custom_packages: customs };
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
