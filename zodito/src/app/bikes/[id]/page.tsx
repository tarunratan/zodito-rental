import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import { formatINR } from '@/lib/utils';

async function fetchBike(id: string) {
  if (isMockMode()) {
    return MOCK_BIKES.find(b => b.id === id) ?? null;
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
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
    .maybeSingle();

  if (error) {
    console.error('fetchBike error:', error);
    return null;
  }
  return data;
}

export default async function BikeDetailPage({ params }: { params: { id: string } }) {
  const bike = await fetchBike(params.id) as any;
  if (!bike) notFound();

  const pkg24 = bike.model.packages.find((p: any) => p.tier === '24hr');
  const isVendor = bike.owner_type === 'vendor';

  // Mock bikes don't have excess_km_rate etc. on the model; fall back to sensible defaults
  const excessRate = bike.model.excess_km_rate ?? (bike.model.cc >= 150 ? 4 : 3);
  const lateRate = bike.model.late_hourly_penalty ?? (bike.model.cc >= 150 ? 89 : 49);

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
              <span className="text-sm text-muted">/ 24 hrs · {pkg24?.km_limit} km</span>
            </div>
            <div className="text-xs text-muted mt-1">
              + 18% GST · ₹500 refundable security deposit
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Spec label="Excess km" value={`₹${excessRate}/km`} />
            <Spec label="Late return" value={`₹${lateRate}/hr`} />
            <Spec label="1 helmet" value="Free" />
            <Spec label="Extra helmet" value="₹50" />
          </div>

          {isVendor && bike.vendor && (
            <div className="mt-5 p-3 bg-primary/5 rounded-lg text-xs">
              <div className="font-semibold text-primary">
                Listed by {bike.vendor.business_name}
              </div>
              <div className="text-muted mt-0.5">
                📍 Pickup in {bike.vendor.pickup_area} · full address shared after booking
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Booking flow */}
      <BookingFlow bike={bike} />
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
