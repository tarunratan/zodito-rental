'use client';

import { cn } from '@/lib/utils';

export type PaymentMethod = 'online' | 'partial_online' | 'at_pickup';

const TABS: ReadonlyArray<readonly [PaymentMethod, string]> = [
  ['online',         '🔒 Pay Full'],
  ['partial_online', '⚡ Pay 20%'],
  ['at_pickup',      '🏪 At Pickup'],
];

export function PaymentMethodTabs({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-bg rounded-xl border border-border">
      {TABS.map(([method, label]) => (
        <button
          key={method}
          onClick={() => onChange(method)}
          className={cn(
            'py-2 px-1.5 rounded-lg text-xs font-medium transition-all leading-tight',
            value === method ? 'bg-white shadow-sm text-primary' : 'text-muted hover:text-primary'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
