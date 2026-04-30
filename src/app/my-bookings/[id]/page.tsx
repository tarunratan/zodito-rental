import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore, MOCK_BIKES } from '@/lib/mock';
import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';
import type { PackageTier } from '@/lib/pricing';

async function fetchBooking(id: string, userId: string) {
  if (isMockMode()) {
    const b = mockBookingsStore.find(x => x.id === id);
    if (!b) return null;
    return { ...b, bike: MOCK_BIKES.find(k => k.id === b.bike_id) };
  }

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('bookings')
    .select(`
      *,
      bike:bikes!inner(
        id, emoji, image_url, color, color_hex, owner_type, registration_number,
        model:bike_models!inner(display_name, cc, excess_km_rate, late_hourly_penalty),
        vendor:vendors(business_name, pickup_area, pickup_address, contact_phone)
      )
    `)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) notFound();
  const booking = await fetchBooking(params.id, user.id) as any;
  if (!booking) notFound();

  const bike = booking.bike;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/my-bookings" className="text-sm text-muted hover:text-primary inline-flex items-center gap-1 mb-6">
        ← All bookings
      </Link>

      <div className="card p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-lg bg-primary/5 flex items-center justify-center text-5xl">
            {bike.emoji}
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl">
              {bike.model.display_name}
            </h1>
            <div className="text-sm text-muted mt-1">
              Booking #{booking.booking_number}
            </div>
            <div className="inline-block mt-2 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-success/15 text-success">
              {booking.status.replace('_', ' ')}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-4">
        <h2 className="font-display font-semibold text-lg mb-4">Rental period</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Detail label="Pickup" value={formatDateTime(booking.start_ts)} />
          <Detail label="Drop-off" value={formatDateTime(booking.end_ts)} />
          <Detail label="Package" value={TIER_LABELS[booking.package_tier as PackageTier]} />
          <Detail label="KM limit" value={`${booking.km_limit} km`} />
        </div>
      </div>

      {bike.owner_type === 'vendor' && bike.vendor && (
        <div className="card p-6 mb-4">
          <h2 className="font-display font-semibold text-lg mb-4">Pickup location</h2>
          <div className="space-y-2 text-sm">
            <div className="font-semibold">{bike.vendor.business_name}</div>
            <div className="text-muted">{bike.vendor.pickup_address ?? bike.vendor.pickup_area}</div>
            {bike.vendor.contact_phone && (
              <a href={`tel:${bike.vendor.contact_phone}`} className="inline-block text-accent font-semibold">
                📞 {bike.vendor.contact_phone}
              </a>
            )}
          </div>
        </div>
      )}

      {bike.owner_type === 'platform' && (
        <div className="card p-6 mb-4">
          <h2 className="font-display font-semibold text-lg mb-4">Pickup location</h2>
          <div className="space-y-2 text-sm">
            <div className="font-semibold">Zodito KPHB Store</div>
            <div className="text-muted">436, Sri Sai Vamshi Residency, Gokul Plots</div>
            <div className="text-muted">KPHB, Kukatpally, Hyderabad – 500 085</div>
            <a
              href="https://maps.app.goo.gl/wFYvrQ3DfyreaS1KA"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-accent font-semibold hover:underline"
            >
              📍 Open in Google Maps
            </a>
            <a href="tel:+919392912953" className="inline-block text-accent font-semibold ml-4">
              📞 +91 93929 12953
            </a>
          </div>
        </div>
      )}

      <div className="card p-6 mb-4">
        <h2 className="font-display font-semibold text-lg mb-4">Payment breakdown</h2>
        <div className="space-y-2 text-sm">
          <Row label={TIER_LABELS[booking.package_tier as PackageTier]} value={formatINR(booking.base_price ?? 0)} />
          {booking.extra_helmet_count > 0 && (
            <Row label={`Extra helmet × ${booking.extra_helmet_count}`} value={formatINR(booking.extra_helmet_price ?? 0)} />
          )}
          <Row label="Subtotal" value={formatINR(booking.subtotal ?? 0)} muted />
          <Row label="GST (18%)" value={formatINR(booking.gst_amount ?? 0)} muted />
          <Row label="Security deposit (refundable)" value={formatINR(booking.security_deposit ?? 0)} muted />
          <div className="pt-3 border-t border-border flex justify-between items-baseline">
            <span className="font-display font-semibold">Total paid</span>
            <span className="font-display font-bold text-xl text-accent">{formatINR(booking.total_amount ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-4">
        <h2 className="font-display font-semibold text-lg mb-3">Extra charges</h2>
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div className="rounded-lg border border-border p-3 bg-bg">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Excess km</div>
            <div className="font-bold text-xl text-primary leading-none">
              ₹{bike.model.excess_km_rate ?? 0}<span className="text-sm font-medium">/km</span>
            </div>
            <div className="text-[11px] text-muted mt-1">after {booking.km_limit} km included</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-bg">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Late return</div>
            <div className="font-bold text-xl text-primary leading-none">
              ₹{bike.model.late_hourly_penalty ?? 0}<span className="text-sm font-medium">/hr</span>
            </div>
            <div className="text-[11px] text-muted mt-1">charged at drop-off</div>
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          Extra charges are collected at the time of vehicle return. Excess km is calculated on the odometer reading at drop-off.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="font-display font-semibold text-lg mb-3">What to bring</h2>
        <ul className="space-y-2.5 text-sm text-muted">
          <li>📄 <strong className="text-primary">Original Driving License</strong> (physical; digital copies not accepted)</li>
          <li>🆔 Soft copy of <strong className="text-primary">Aadhaar Card</strong> for verification</li>
          <li>💳 Your ID — the license holder must be present to collect the vehicle</li>
          <li className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800">
            <span className="font-semibold">⛽ Fuel Policy</span><br />
            Fuel is not included in the rental charges. The vehicle will be provided with a minimal amount of fuel, sufficient to reach the nearest petrol station. Customers are required to refuel as per their needs. <strong>Fuel charges are non-refundable.</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-muted' : ''}>{label}</span>
      <span className={muted ? 'text-muted' : 'font-semibold'}>{value}</span>
    </div>
  );
}
