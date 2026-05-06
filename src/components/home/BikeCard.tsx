import Link from 'next/link';
import { formatINR } from '@/lib/utils';

type Bike = any;

export function BikeCard({ bike, searchFrom, searchTo }: { bike: Bike; searchFrom?: string; searchTo?: string }) {
  const isVendor = bike.owner_type === 'vendor';
  const pickupLocation = isVendor
    ? (bike.vendor?.pickup_area ?? bike.vendor?.business_name ?? null)
    : 'KPHB, Hyderabad';

  const href = searchFrom && searchTo
    ? `/bikes/${bike.id}?from=${encodeURIComponent(searchFrom)}&to=${encodeURIComponent(searchTo)}`
    : `/bikes/${bike.id}`;

  const packages: any[] = bike.model?.packages ?? [];
  const customPackages: any[] = (bike.custom_packages ?? []).filter((p: any) => p.is_active);
  const pkg12 = packages.find((p: any) => p.tier === '12hr');
  const pkg24 = packages.find((p: any) => p.tier === '24hr');

  // Minimum price across all packages (standard + active custom)
  const allPrices = [
    ...packages.map((p: any) => Number(p.price)),
    ...customPackages.map((p: any) => Number(p.price)),
  ].filter(v => v > 0);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const minPkg = minPrice !== null
    ? (customPackages.find((p: any) => Number(p.price) === minPrice) ?? packages.find((p: any) => Number(p.price) === minPrice))
    : null;

  // Determine price/label to show for the searched duration.
  // Checks custom packages first (exact duration_hours match), then standard tiers, then fallback.
  const searchDisplay: { price: number; label: string; km: number } | null = (() => {
    if (!searchFrom || !searchTo) return null;
    const searchHrs = Math.round((new Date(searchTo).getTime() - new Date(searchFrom).getTime()) / 3_600_000);
    if (searchHrs <= 0) return null;

    // Check custom packages first — range match (smallest bracket covering the duration)
    const customMatch = customPackages
      .filter((p: any) => searchHrs >= (p.min_duration_hours ?? 0) && searchHrs <= p.duration_hours)
      .sort((a: any, b: any) => a.duration_hours - b.duration_hours)[0] ?? null;
    if (customMatch) {
      return { price: Number(customMatch.price), label: customMatch.label, km: customMatch.km_limit };
    }

    // Try exact tier match by hour count
    const tierMap: Array<[string, number]> = [
      ['12hr',12],['24hr',24],['2day',48],['3day',72],
      ['96hr',96],['120hr',120],['144hr',144],['7day',168],['15day',360],['30day',720],
    ];
    for (const [tier, h] of tierMap) {
      if (h === searchHrs) {
        const pkg = packages.find((p: any) => p.tier === tier);
        if (pkg) {
          const label = tier === '2day' ? '2 days' : tier === '3day' ? '3 days' :
            tier === '96hr' ? '4 days' : tier === '120hr' ? '5 days' :
            tier === '144hr' ? '6 days' : tier === '7day' ? '7 days' :
            tier === '15day' ? '15 days' : tier === '30day' ? '30 days' :
            tier === '12hr' ? '12 hrs' : '24 hrs';
          return { price: Number(pkg.price), label, km: pkg.km_limit };
        }
      }
    }

    // Fallback to 24hr daily rate × days
    if (pkg24 && searchHrs >= 12) {
      if (searchHrs <= 24) return { price: Number(pkg24.price), label: '24 hrs', km: pkg24.km_limit };
      const days = Math.ceil(searchHrs / 24);
      return { price: days * Number(pkg24.price), label: `${days} days`, km: days * pkg24.km_limit };
    }
    if (pkg12 && searchHrs <= 12) return { price: Number(pkg12.price), label: '12 hrs', km: pkg12.km_limit };

    return null;
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
