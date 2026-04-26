'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { VendorsTab } from './VendorsTab';
import { BikesTab } from './BikesTab';
import { KycTab } from './KycTab';
import { BookingsTab } from './BookingsTab';

type TabId = 'vendors' | 'bikes' | 'kyc' | 'bookings';

export function AdminTabs({ data }: { data: any }) {
  const [tab, setTab] = useState<TabId>('vendors');

  const TABS: Array<{ id: TabId; label: string; badge?: number }> = [
    { id: 'vendors', label: 'Vendors', badge: data.stats.pending_vendors },
    { id: 'bikes', label: 'Bike Listings', badge: data.stats.pending_bikes },
    { id: 'kyc', label: 'KYC Reviews', badge: data.stats.pending_kyc },
    { id: 'bookings', label: 'Bookings' },
  ];

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Pending Vendors" value={data.stats.pending_vendors} highlight={data.stats.pending_vendors > 0} />
        <Kpi label="Pending Bikes" value={data.stats.pending_bikes} highlight={data.stats.pending_bikes > 0} />
        <Kpi label="KYC to Review" value={data.stats.pending_kyc} highlight={data.stats.pending_kyc > 0} />
        <Kpi label="Active Rentals" value={data.stats.active_bookings} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-3 font-semibold text-sm flex items-center gap-2 transition-all whitespace-nowrap',
              tab === t.id
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-muted hover:text-primary'
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                tab === t.id ? 'bg-accent text-white' : 'bg-warning/20 text-warning'
              )}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {tab === 'vendors' && <VendorsTab vendors={data.vendors} />}
      {tab === 'bikes' && <BikesTab pendingBikes={data.pending_bikes} allBikes={data.all_bikes ?? []} models={data.bike_models ?? []} />}
      {tab === 'kyc' && <KycTab users={data.pending_kyc} />}
      {tab === 'bookings' && <BookingsTab bookings={data.bookings} />}
    </>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={cn('font-display font-bold text-2xl mt-0.5', highlight && 'text-warning')}>
        {value}
      </div>
    </div>
  );
}
