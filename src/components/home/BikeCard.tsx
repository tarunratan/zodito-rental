import Link from 'next/link';
import { formatINR } from '@/lib/utils';
import { coveringTier, calculatePrice, TIER_LABELS, type CustomPackage, type PackageTier } from '@/lib/pricing';

type Bike = any;

export function BikeCard({ bike, searchFrom, searchTo }: { bike: Bike; searchFrom?: string; searchTo?: string }) {
  // Final safety net: even if every server-side filter let this bike slip
  // through, the card itself refuses to render an inactive / unapproved
  // listing. There is NO scenario where a customer should see such a card.
  if (bike?.is_active === false) return null;
  if (bike?.listing_status && bike.listing_status !== 'approved') return null;

  const isVendor = bike.owner_type === 'vendor';
  const pickupLocation = isVendor
    ? (bike.vendor?.pickup_area ?? bike.vendor?.business_name ?? null)
    : 'KPHB, Hyderabad';

  const href = searchFrom && searchTo
    ? `/bikes/${bike.id}?from=${encodeURIComponent(searchFrom)}&to=${encodeURIComponent(searchTo)}`
    : `/bikes/${bike.id}`;

  // `bike.model.packages` is already UNION-merged on the server (see
  // src/app/page.tsx → fetchBikes). It now contains every tier the admin has
  // an override for, even ones the model itself never seeded (36hr / 2day /
  // 60hr / 3day / …). Likewise `bike.custom_packages` is server-attached.
  const packages: any[] = bike.model?.packages ?? [];
  const customPackages: CustomPackage[] = (bike.custom_packages ?? []) as CustomPackage[];
  // Used by the "24 hrs · ₹X" sidecar at the bottom-right of the card.
  const pkg24 = packages.find((p: any) => p.tier === '24hr');

  // Minimum price across all packages (standard + active custom).
  const allPrices = [
    ...packages.map((p: any) => Number(p.price)),
    ...customPackages.map((p: any) => Number(p.price)),
  ].filter(v => v > 0);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const minPkg = minPrice !== null
    ? (customPackages.find((p: any) => Number(p.price) === minPrice) ?? packages.find((p: any) => Number(p.price) === minPrice))
    : null;

  // Search-aware "this exact trip costs ₹X" price.
  //
  // Single source of truth: `coveringTier(...)` → `calculatePrice(...)`. The
  // same pair runs on /bikes/[id] and /api/pricing/quote, so the home card,
  // detail page, and checkout always agree. There is NO local fallback like
  // "days × 24hr_price" — if no admin-configured tier covers the duration,
  // we surface a "Configure on detail page" hint instead of a wrong number.
  const searchDisplay: { price: number; label: string; km: number; isCustom?: boolean } | null = (() => {
    if (!searchFrom || !searchTo) return null;
    const searchHrs = (new Date(searchTo).getTime() - new Date(searchFrom).getTime()) / 3_600_000;
    if (searchHrs <= 0) return null;

    const availableTiers: PackageTier[] = packages.map((p: any) => p.tier as PackageTier);
    const match = coveringTier(searchHrs, availableTiers, customPackages);
    if (!match) return null;

    try {
      const breakdown = match.type === 'custom'
        ? calculatePrice({ customPackage: match.pkg, customActualHours: searchHrs, extraHelmetCount: 0, hasOriginalDL: true })
        : calculatePrice({
            packages: packages as any,
            tier: match.tier,
            actualDays: match.actualDays,
            extraHelmetCount: 0,
            hasOriginalDL: true,
          });
      const label = match.type === 'custom'
        ? match.pkg.label
        : (match.actualDays && match.actualDays > 1
            ? `${match.actualDays} Days`
            : (TIER_LABELS[match.tier] ?? match.tier));
      return { price: breakdown.basePrice, label, km: breakdown.kmLimit, isCustom: match.type === 'custom' };
    } catch {
      return null;
    }
  })();

  return (
    <Link href={href} className="group card overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
      {/* Image area */}
      <div className="relative h-44 bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center overflow-hidden">
        {bike.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bike.image_url} alt={bike.model.display_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="text-7xl">{bike.emoji || '🏍️'}</div>
        )}
        <div className="absolute top-3 left-3">
          {isVendor ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-white/95 text-primary px-2 py-1 rounded-md shadow-sm">Partner</span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent text-white px-2 py-1 rounded-md shadow-sm">Zodito Fleet</span>
          )}
        </div>
        {bike.model?.cc && (
          <div className="absolute top-3 right-3 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-md">
            {bike.model.cc}cc
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-display font-semibold text-base leading-snug line-clamp-1">{bike.model.display_name}</h3>
          {bike.rating_count > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-muted shrink-0">
              <span className="text-accent">★</span>{bike.rating_avg?.toFixed(1)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted mb-2 flex-wrap">
          {bike.color_hex && (
            <span className="w-3 h-3 rounded-full border border-border shrink-0" style={{ backgroundColor: bike.color_hex }} />
          )}
          <span>{bike.color ?? '—'}</span>
          {bike.year && <span>· {bike.year}</span>}
        </div>

        {/* Pickup location */}
        {pickupLocation && (
          isVendor ? (
            <div className="flex items-center gap-1 text-[11px] text-muted mb-3">
              <span>📍</span>
              <span className="line-clamp-1">{pickupLocation}</span>
            </div>
          ) : (
            <a
              href="https://maps.app.goo.gl/wFYvrQ3DfyreaS1KA"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-accent hover:underline mb-3"
            >
              <span>📍</span>
              <span className="line-clamp-1">KPHB, Kukatpally, Hyderabad</span>
            </a>
          )
        )}

        {/* Price — dynamic based on search, or default */}
        <div className="flex items-baseline justify-between pt-3 border-t border-border">
          {searchDisplay ? (
            <div className="w-full">
              <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Your trip</div>
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-bold text-xl text-accent">{formatINR(searchDisplay.price)}</span>
                  <span className="text-xs text-muted">/ {searchDisplay.label}</span>
                </div>
                <span className="text-[11px] text-muted">{searchDisplay.km} km</span>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Starts at</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-bold text-xl text-primary">
                    {minPrice !== null ? formatINR(minPrice) : '—'}
                  </span>
                  {minPkg && (
                    <span className="text-xs text-muted">
                      / {minPkg.label ?? (minPkg.tier === '12hr' ? '12 hrs' : minPkg.tier === '24hr' ? '24 hrs' : minPkg.tier)}
                    </span>
                  )}
                </div>
              </div>
              {pkg24 && (
                <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wide">24 hrs</div>
                  <div className="font-display font-bold text-base text-accent">{formatINR(pkg24.price)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
