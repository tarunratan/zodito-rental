'use client';

import { useState } from 'react';
import { formatINR, cn } from '@/lib/utils';
import { TIER_LABELS, TIER_ORDER, FLEX_TIER_RANGES, isFlexTier } from '@/lib/pricing';
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
  actualDays,
  onActualDaysChange,
}: {
  packages: PackageData[];
  value: PackageTier;
  onChange: (t: PackageTier) => void;
  actualDays?: number;
  onActualDaysChange?: (d: number) => void;
}) {
  const [flexDays, setFlexDays] = useState<Record<string, number>>({
    weekly_flex:  7,
    monthly_flex: 15,
  });

  const sorted = TIER_ORDER
    .map(t => packages.find(p => p.tier === t))
    .filter(Boolean) as PackageData[];

  function handleFlexDayChange(tier: 'weekly_flex' | 'monthly_flex', raw: string) {
    const range = FLEX_TIER_RANGES[tier];
    const n = Math.max(range.min, Math.min(range.max, parseInt(raw, 10) || range.min));
    setFlexDays(prev => ({ ...prev, [tier]: n }));
    if (value === tier) onActualDaysChange?.(n);
  }

  function handleSelect(tier: PackageTier) {
    onChange(tier);
    if (isFlexTier(tier)) {
      onActualDaysChange?.(flexDays[tier]);
    } else {
      onActualDaysChange?.(0);
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {sorted.map(pkg => {
        const active   = pkg.tier === value;
        const isFlex   = isFlexTier(pkg.tier);
        const days     = isFlex ? flexDays[pkg.tier] : undefined;
        const price    = isFlex && days ? pkg.price * days : pkg.price;
        const kmLimit  = isFlex && days ? pkg.km_limit * days : pkg.km_limit;
        const range    = isFlex ? FLEX_TIER_RANGES[pkg.tier as 'weekly_flex' | 'monthly_flex'] : null;

        return (
          <div key={pkg.tier} className="relative">
            <button
              onClick={() => handleSelect(pkg.tier)}
              className={cn(
                'w-full p-3 rounded-lg border-[1.5px] text-left transition-all',
                active
                  ? 'border-accent bg-accent/10 shadow-sm'
                  : 'border-border bg-white hover:border-accent/50'
              )}
            >
              <div className={cn('text-[10px] font-semibold uppercase tracking-wide truncate', active ? 'text-accent' : 'text-muted')}>
                {TIER_LABELS[pkg.tier]}
              </div>
              <div className="font-display font-bold text-lg mt-0.5">
                {formatINR(price)}
                {isFlex && <span className="text-xs font-normal text-muted"> ({days}d)</span>}
              </div>
              <div className="text-[11px] text-muted mt-0.5">{kmLimit.toLocaleString('en-IN')} km</div>
              {active && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">
                  ✓
                </div>
              )}
            </button>

            {/* Flex tier day selector — only shown when this tier is active */}
            {isFlex && active && range && (
              <div className="mt-1 flex items-center gap-2 px-1">
                <span className="text-[11px] text-muted">Days:</span>
                <input
                  type="number"
                  min={range.min}
                  max={range.max}
                  value={flexDays[pkg.tier]}
                  onChange={e => handleFlexDayChange(pkg.tier as 'weekly_flex' | 'monthly_flex', e.target.value)}
                  className="input-field w-16 text-sm py-1 px-2"
                />
                <span className="text-[11px] text-muted">{range.min}–{range.max}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
