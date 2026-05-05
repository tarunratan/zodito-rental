import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { getCurrentAppUser } from '@/lib/auth';
import type { CustomPackage } from '@/lib/pricing';

// Bike details change infrequently — serve from cache, regenerate in background every hour
export const revalidate = 3600;
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import { formatINR } from '@/lib/utils';

async function fetchBike(id: string) {
  if (isMockMode()) {
    return { bike: MOCK_BIKES.find(b => b.id === id) ?? null, customPackages: [] as CustomPackage[] };
  }

  const supabase = createSupabaseAdmin();
  const [bikeRes, bikePackagesRes, customPkgsRes] = await Promise.all([
    supabase
      .from('bikes')
      .select(`
        id, emoji, image_url, image_url_2, image_url_3, color, color_hex, year,
        total_rides, rating_avg, rating_count, owner_type, registration_number,
        model:bike_models!inner(
          id, name, display_name, category, cc,
          excess_km_rate, late_hourly_penalty, has_weekend_override, weekend_override_model_id,
          packages:bike_model_packages(tier, price, km_limit)
        ),
        vendor:vendors(id, business_name, pickup_area, pickup_address)
      `)
      .eq('id', id)
      .eq('is_active', true)
      .eq('listing_status', 'approved')
      .maybeSingle(),
    // Per-bike price overrides — gracefully handle if table doesn't exist yet
    supabase
      .from('bike_packages')
      .select('tier, price, km_limit')
      .eq('bike_id', id)
      .then((r: any) => r.data ?? [])
      .catch(() => [] as any[]),
    // Admin-created custom duration packages for this bike
    supabase
      .from('custom_packages')
      .select('id, bike_id, label, duration_hours, price, km_limit, is_active')
      .eq('bike_id', id)
      .eq('is_active', true)
      .order('duration_hours', { ascending: true })
      .then((r: any) => (r.data ?? []) as CustomPackage[])
      .catch(() => [] as CustomPackage[]),
  ]);

  if (bikeRes.error) {
    console.error('fetchBike error:', bikeRes.error);
    return { bike: null, customPackages: [] as CustomPackage[] };
  }
  const bike = bikeRes.data;
  if (!bike) return { bike: null, customPackages: [] as CustomPackage[] };

  // Merge: per-bike overrides take priority over model-level packages
  const overrides = bikePackagesRes as any[];
  if (overrides.length > 0) {
    bike.model.packages = bike.model.packages.map((mp: any) => {
      const ov = overrides.find((bp: any) => bp.tier === mp.tier);
      return ov ? { ...mp, price: ov.price, km_limit: ov.km_limit } : mp;
    });
  }

  return { bike, customPackages: customPkgsRes };
}

export default async function BikeDetailPage({ params }: { params: { id: string } }) {
  const [{ bike, customPackages }, user] = await Promise.all([fetchBike(params.id), getCurrentAppUser()]);
  if (!bike) notFound();
  const kycStatus = user?.kyc_status ?? null;

  const pkg24 = bike.model.packages.find((p: any) => p.tier === '24hr');
  const isVendor = bike.owner_type === 'vendor';

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-6">
        ← Back to browse
      </Link>

      <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 mb-10">
        {/* Image panel */}
        <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-card h-[360px] flex items-center justify-center relative overflow-hidden">
          {bike.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bike.image_url} alt={bike.model.display_name} className="w-full h-full object-cover" />
          ) : (
            <div className="text-[200px] leading-none">{bike.emoji}</div>
          )}

          <div className="absolute top-4 left-4 flex gap-2">
            {isVendor ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-white/95 text-primary px-2.5 py-1 rounded-md shadow">
                Partner Bike
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent text-white px-2.5 py-1 rounded-md shadow">
                Zodito Fleet
              </span>
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary text-white px-2.5 py-1 rounded-md">
              {bike.model.cc}cc
            </span>
          </div>
        </div>

        {/* Summary panel */}
        <div>
          <h1 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight">
            {bike.model.display_name}
          </h1>

          <div className="flex items-center gap-4 mt-3 text-sm text-muted">
            {bike.color_hex && (
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-border"
                  style={{ backgroundColor: bike.color_hex }}
                />
                {bike.color}
              </span>
            )}
            {bike.year && <span>• {bike.year}</span>}
            {bike.rating_count > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-accent">★</span>
                {bike.rating_avg?.toFixed(1)} ({bike.rating_count})
              </span>
            )}
            {bike.total_rides > 0 && (
              <span>• {bike.total_rides} rides</span>
            )}
          </div>

          <div className="mt-6 p-4 bg-accent/5 border border-accent/20 rounded-card">
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-3xl text-primary">
                {pkg24 ? formatINR(pkg24.price) : '—'}
              </span>
              <span className="text-sm text-muted">/ 24 hrs</span>
            </div>
            <div className="text-xs text-muted mt-1">
              + 18% GST · ₹500 refundable security deposit
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Spec label="1 helmet" value="Free" />
            <Spec label="Extra helmet" value="₹50" />
          </div>

          {isVendor && bike.vendor ? (
            <div className="mt-5 p-3 bg-primary/5 rounded-lg text-xs">
              <div className="font-semibold text-primary">Listed by {bike.vendor.business_name}</div>
              <div className="text-muted mt-0.5">
                📍 Pickup in {bike.vendor.pickup_area} · full address shared after booking
              </div>
            </div>
          ) : (
            <a
              href="https://maps.app.goo.gl/wFYvrQ3DfyreaS1KA"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs flex items-start gap-2 hover:bg-accent/10 transition-colors group"
            >
              <span className="text-base mt-0.5">📍</span>
              <div>
                <div className="font-semibold text-primary group-hover:text-accent transition-colors">Zodito KPHB Store</div>
                <div className="text-muted mt-0.5">436, Sri Sai Vamshi Residency, Gokul Plots</div>
                <div className="text-muted">KPHB, Kukatpally, Hyderabad – 500 085</div>
                <div className="text-accent mt-1 font-medium">Open in Maps →</div>
              </div>
            </a>
          )}
        </div>
      </div>

      {/* Booking flow — Suspense needed because BookingFlow reads useSearchParams() */}
      <Suspense fallback={<div className="h-72 rounded-card bg-border/20 animate-pulse" />}>
        <BookingFlow bike={bike} kycStatus={kycStatus} isLoggedIn={!!user} customPackages={customPackages} />
      </Suspense>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white border border-border rounded-lg">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}
