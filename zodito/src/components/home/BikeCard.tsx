import Link from 'next/link';
import { formatINR } from '@/lib/utils';

type Bike = any;

export function BikeCard({ bike }: { bike: Bike }) {
  const pkg24 = bike.model?.packages?.find((p: any) => p.tier === '24hr');
  const pkg12 = bike.model?.packages?.find((p: any) => p.tier === '12hr');
  const isVendor = bike.owner_type === 'vendor';

  return (
    <Link
      href={`/bikes/${bike.id}`}
      className="group card overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image / emoji area */}
      <div className="relative h-44 bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center overflow-hidden">
        {bike.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bike.image_url}
            alt={bike.model.display_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="text-7xl">{bike.emoji || '🏍️'}</div>
        )}

        {/* Badge */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {isVendor ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-white/95 text-primary px-2 py-1 rounded-md shadow-sm">
              Partner Bike
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent text-white px-2 py-1 rounded-md shadow-sm">
              Zodito Fleet
            </span>
          )}
        </div>

        {/* CC badge */}
        {bike.model?.cc && (
          <div className="absolute top-3 right-3 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-md">
            {bike.model.cc}cc
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-display font-semibold text-base leading-snug line-clamp-1">
            {bike.model.display_name}
          </h3>
          {bike.rating_count > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-muted shrink-0">
              <span className="text-accent">★</span>
              {bike.rating_avg?.toFixed(1)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted mb-3">
          {bike.color_hex && (
            <span
              className="w-3 h-3 rounded-full border border-border"
              style={{ backgroundColor: bike.color_hex }}
              aria-label={bike.color ?? ''}
            />
          )}
          <span>{bike.color ?? '—'}</span>
          {bike.year && <span>• {bike.year}</span>}
          {isVendor && bike.vendor?.pickup_area && (
            <span className="ml-auto text-[11px] text-muted">
              📍 {bike.vendor.pickup_area}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline justify-between pt-3 border-t border-border">
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Starts at</div>
            <div className="flex items-baseline gap-1">
              <span className="font-display font-bold text-xl text-primary">
                {pkg12 ? formatINR(pkg12.price) : '—'}
              </span>
              <span className="text-xs text-muted">/ 12 hrs</span>
            </div>
          </div>
          {pkg24 && (
            <div className="text-right">
              <div className="text-[10px] text-muted uppercase tracking-wide">24 hrs</div>
              <div className="font-display font-bold text-base text-accent">
                {formatINR(pkg24.price)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
