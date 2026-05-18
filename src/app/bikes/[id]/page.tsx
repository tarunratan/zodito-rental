import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { getCurrentAppUser } from '@/lib/auth';
import type { CustomPackage } from '@/lib/pricing';
import { mergeBikePackages } from '@/lib/pricing';
import { isFrozenNow } from '@/lib/freeze';

// Customer detail page must always reflect the latest admin-set pricing.
// Static ISR was masking price edits for up to an hour — render dynamically
// so the booking flow always sees fresh per-bike packages, custom packages,
// and policy fields.
export const dynamic = 'force-dynamic';
import { isMockMode, MOCK_BIKES } from '@/lib/mock';
import { formatINR } from '@/lib/utils';

/** Reason the bike isn't viewable (for the friendly error page + server logs). */
type FetchReason = 'not_found' | 'inactive' | 'unapproved' | 'frozen' | 'query_error';

async function fetchBike(id: string, allowPreview: boolean) {
  if (isMockMode()) {
    return { bike: MOCK_BIKES.find(b => b.id === id) ?? null, customPackages: [] as CustomPackage[], reason: null as FetchReason | null };
  }

  const supabase = createSupabaseAdmin();
  // First read without the visibility filters — lets us tell apart "id doesn't
  // exist", "deactivated", and "pending approval" so the page (and server logs)
  // can surface the actual reason instead of a generic 404.
  const [bikeRes, bikePackagesRes, customPkgsRes] = await Promise.all([
    supabase
      .from('bikes')
      .select(`
        id, emoji, image_url, image_url_2, image_url_3, color, color_hex, year,
        total_rides, rating_avg, rating_count, owner_type, registration_number,
        extra_km_rate, late_penalty_hour, is_active, listing_status,
        is_frozen, frozen_from, frozen_until, freeze_reason, updated_at,
        model:bike_models!inner(
          id, name, display_name, category, cc,
          excess_km_rate, late_hourly_penalty, has_weekend_override, weekend_override_model_id,
          packages:bike_model_packages(tier, price, km_limit)
        ),
        vendor:vendors(id, business_name, pickup_area, pickup_address)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('bike_packages')
      .select('tier, price, km_limit')
      .eq('bike_id', id)
      .then((r: any) => r.data ?? [])
      .catch(() => [] as any[]),
    supabase
      .from('custom_packages')
      .select('id, bike_id, label, min_duration_hours, duration_hours, price, km_limit, per_day_price, per_day_km_limit, is_active')
      .eq('bike_id', id)
      .eq('is_active', true)
      .order('duration_hours', { ascending: true })
      .then((r: any) => (r.data ?? []) as CustomPackage[])
      .catch(() => [] as CustomPackage[]),
  ]);

  if (bikeRes.error) {
    console.error('[bikes/[id]] fetch error:', bikeRes.error, 'id:', id);
    return { bike: null, rawBike: null, customPackages: [] as CustomPackage[], reason: 'query_error' as FetchReason };
  }

  const bike = bikeRes.data as any;
  if (!bike) {
    console.warn('[bikes/[id]] bike not found in DB:', id);
    return { bike: null, rawBike: null, customPackages: [] as CustomPackage[], reason: 'not_found' as FetchReason };
  }

  // Enforce the public-visibility filters unless an admin is previewing.
  if (!allowPreview) {
    // Strict `=== false` so an undefined column read (e.g. column missing
    // from the select) doesn't accidentally mark the bike inactive.
    if (bike.is_active === false) {
      console.warn('[bikes/[id]] bike is deactivated:', id, 'is_active:', bike.is_active);
      return { bike: null, rawBike: bike, customPackages: [] as CustomPackage[], reason: 'inactive' as FetchReason };
    }
    if (bike.listing_status && bike.listing_status !== 'approved') {
      console.warn('[bikes/[id]] bike listing not approved:', id, 'status:', bike.listing_status);
      return { bike: null, rawBike: bike, customPackages: [] as CustomPackage[], reason: 'unapproved' as FetchReason };
    }
    // Currently frozen → block detail-page render too. Customers shouldn't be
    // able to reach the booking flow via a direct URL while a freeze is in
    // effect. Future-dated freeze windows still let the bike browse normally;
    // the booking flow blocks the dates inside the window.
    if (isFrozenNow(bike)) {
      console.warn('[bikes/[id]] bike is currently frozen:', id, 'until:', bike.frozen_until);
      return { bike: null, rawBike: bike, customPackages: [] as CustomPackage[], reason: 'frozen' as FetchReason };
    }
  }

  // UNION merge — see commit 4f5202d for the rationale.
  bike.model.packages = mergeBikePackages(bike.model.packages, bikePackagesRes as any[]);

  return { bike, rawBike: bike, customPackages: customPkgsRes, reason: null as FetchReason | null };
}

export default async function BikeDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { preview?: string; debug?: string };
}) {
  const user = await getCurrentAppUser();
  // Admins can append `?preview=1` to view a bike that isn't approved or is
  // deactivated — useful for previewing a listing before publishing without
  // toggling the bike live. Customers get the standard visibility filters.
  const allowPreview = !!(user?.role === 'admin' && searchParams?.preview === '1');
  const isDebug = !!(user?.role === 'admin' && searchParams?.debug === '1');
  const fetchedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  const { bike, rawBike, customPackages, reason } = await fetchBike(params.id, allowPreview);

  // Friendly explanation instead of a bare 404 so the admin / vendor can
  // see WHY the link isn't loading.
  if (!bike) {
    if (reason === 'not_found') notFound();
    return <BikeUnavailable reason={reason} bikeId={params.id} isAdmin={user?.role === 'admin'} rawBike={isDebug ? rawBike : null} fetchedAt={isDebug ? fetchedAt : null} />;
  }

  const kycStatus = user?.kyc_status ?? null;

  const isVendor = bike.owner_type === 'vendor';

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {allowPreview && (
        <div className="rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2 mb-4 flex items-center justify-between gap-2 text-sm">
          <span>
            🛡 <strong>Admin preview</strong> — bypassing visibility filters.
            Listing status: <code className="font-mono text-xs bg-white border border-border px-1 py-0.5 rounded">{bike.listing_status}</code>
            {' · is_active: '}
            <code className="font-mono text-xs bg-white border border-border px-1 py-0.5 rounded">{String(bike.is_active)}</code>
          </span>
          <Link href={`/bikes/${bike.id}`} className="text-xs font-semibold text-accent hover:underline shrink-0">
            View as customer →
          </Link>
        </div>
      )}
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

      {isDebug && (
        <div style={{ position:'fixed', bottom:12, right:12, maxWidth:480, background:'rgba(0,0,0,0.92)', color:'#fff', padding:'12px 14px', borderRadius:10, fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize:11, lineHeight:1.5, zIndex:9999, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ fontWeight:700, marginBottom:4, color:'#7cf' }}>[debug] Bike detail — fetched at {fetchedAt} IST</div>
          <div>id: <span style={{ color:'#fff' }}>{bike.id}</span></div>
          <div style={{ marginTop:4 }}>
            is_active=<span style={{ color: bike.is_active ? '#8f8' : '#f88' }}>{String(bike.is_active)}</span>
            {' · '}listing_status=<span style={{ color: bike.listing_status === 'approved' ? '#8f8' : '#f88' }}>{bike.listing_status}</span>
            {' · '}is_frozen=<span style={{ color: bike.is_frozen ? '#f88' : '#8f8' }}>{String(bike.is_frozen ?? 'undefined')}</span>
          </div>
          <div style={{ marginTop:2 }}>
            frozen_from: <span style={{ color:'#ccc' }}>{bike.frozen_from ?? '—'}</span>
          </div>
          <div>
            frozen_until: <span style={{ color:'#ccc' }}>{bike.frozen_until ?? '—'}</span>
          </div>
          <div>
            freeze_reason: <span style={{ color:'#ccc' }}>{bike.freeze_reason ?? '—'}</span>
          </div>
          <div style={{ marginTop:4, color:'#888' }}>
            updated_at: {bike.updated_at ?? '—'}
          </div>
        </div>
      )}
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

function BikeUnavailable({ reason, bikeId, isAdmin, rawBike, fetchedAt }: { reason: FetchReason | null; bikeId: string; isAdmin: boolean; rawBike?: any; fetchedAt?: string | null }) {
  const copy = (() => {
    switch (reason) {
      case 'inactive':    return { title: 'This bike is currently offline', body: 'The owner has temporarily deactivated this listing. Browse other available bikes instead.' };
      case 'unapproved':  return { title: 'This listing is awaiting approval', body: 'A new bike was added but our team hasn’t reviewed it yet. Please check back shortly.' };
      case 'frozen':      return { title: 'This bike is under maintenance', body: 'It has been temporarily frozen for service. Try another bike below — we’ll bring this one back online soon.' };
      case 'query_error': return { title: 'Something went wrong loading this bike', body: 'A server error occurred while looking up the listing. Please try again in a moment.' };
      default:            return { title: 'This bike isn’t available right now', body: 'It may have been removed by the owner or admin. Try one of the active bikes below.' };
    }
  })();

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h1 className="font-display font-bold text-2xl mb-2">{copy.title}</h1>
      <p className="text-muted mb-6">{copy.body}</p>

      {isAdmin && (
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 text-left mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-accent mb-1">Admin diagnostic</p>
          <p className="text-xs text-muted mb-2">
            Bike id <span className="font-mono">{bikeId}</span> &middot;
            reason: <span className="font-mono">{reason ?? 'unknown'}</span>
          </p>
          {rawBike && (
            <div style={{ fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize:11, background:'rgba(0,0,0,0.85)', color:'#fff', borderRadius:8, padding:'8px 10px', marginBottom:8 }}>
              <div style={{ color:'#7cf', fontWeight:700, marginBottom:4 }}>[debug] raw DB state — fetched at {fetchedAt} IST</div>
              <div>is_active=<span style={{ color: rawBike.is_active ? '#8f8' : '#f88' }}>{String(rawBike.is_active)}</span>{' · '}listing_status=<span style={{ color: rawBike.listing_status === 'approved' ? '#8f8' : '#f88' }}>{rawBike.listing_status}</span>{' · '}is_frozen=<span style={{ color: rawBike.is_frozen ? '#f88' : '#8f8' }}>{String(rawBike.is_frozen ?? 'undefined')}</span></div>
              <div style={{ color:'#ccc' }}>frozen_from: {rawBike.frozen_from ?? '—'}</div>
              <div style={{ color:'#ccc' }}>frozen_until: {rawBike.frozen_until ?? '—'}</div>
              <div style={{ color:'#ccc' }}>freeze_reason: {rawBike.freeze_reason ?? '—'}</div>
              <div style={{ color:'#888', marginTop:2 }}>updated_at: {rawBike.updated_at ?? '—'}</div>
            </div>
          )}
          <Link
            href={`/bikes/${bikeId}?preview=1`}
            className="inline-block text-xs font-semibold text-accent hover:underline"
          >
            Open as admin preview →
          </Link>
          {rawBike && (
            <Link
              href={`/bikes/${bikeId}?preview=1&debug=1`}
              className="inline-block text-xs font-semibold text-accent hover:underline ml-4"
            >
              Open as admin preview + debug →
            </Link>
          )}
        </div>
      )}

      <Link href="/" className="inline-block btn-accent text-sm">← Back to browse</Link>
    </div>
  );
}
