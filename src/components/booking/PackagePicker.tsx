'use client';

import { formatINR, cn } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';
import type { PackageTier } from '@/lib/supabase/types';

interface PackageData {
  tier: PackageTier;
  price: number;
  km_limit: number;
}

export function PackagePicker({
  packages,
  value,
  onChange,
}: {
  packages: PackageData[];
  value: PackageTier;
  onChange: (t: PackageTier) => void;
}) {
  const order: PackageTier[] = ['6hr', '12hr', '24hr', '2day', '3day', '7day', '15day', '30day'];
  const sorted = order
    .map(t => packages.find(p => p.tier === t))
    .filter(Boolean) as PackageData[];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
      {sorted.map(pkg => {
        const active = pkg.tier === value;
        return (
          <button
            key={pkg.tier}
            onClick={() => onChange(pkg.tier)}
            className={cn(
              'relative p-3 rounded-lg border-[1.5px] text-left transition-all',
              active
                ? 'border-accent bg-accent/10 shadow-sm'
                : 'border-border bg-white hover:border-accent/50'
            )}
          >
            <div className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              active ? 'text-accent' : 'text-muted'
            )}>
              {TIER_LABELS[pkg.tier]}
            </div>
            <div className="font-display font-bold text-xl mt-1">
              {formatINR(pkg.price)}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {pkg.km_limit.toLocaleString('en-IN')} km
            </div>
            {active && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">
                ✓
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
