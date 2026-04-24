'use client';

import { useMemo, useState } from 'react';
import { BikeCard } from './BikeCard';
import { cn } from '@/lib/utils';
import type { BikeCategory, PackageTier } from '@/lib/supabase/types';

type BikeRow = any; // shape from HomePage fetch

const CATEGORIES: Array<{ id: BikeCategory | 'all'; label: string; icon: string }> = [
  { id: 'all', label: 'All Bikes', icon: '🏍️' },
  { id: 'scooter', label: 'Scooters', icon: '🛵' },
  { id: 'bike_sub150', label: '125 – 150cc', icon: '🏍️' },
  { id: 'bike_plus150', label: '150cc+', icon: '🏁' },
];

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low → High' },
  { id: 'price_desc', label: 'Price: High → Low' },
  { id: 'rating', label: 'Top Rated' },
];

export function BrowseSection({ bikes }: { bikes: BikeRow[] }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]['id']>('all');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('newest');
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'platform' | 'vendor'>('all');

  const filtered = useMemo(() => {
    let list = bikes.slice();

    if (cat !== 'all') list = list.filter(b => b.model?.category === cat);
    if (ownerFilter !== 'all') list = list.filter(b => b.owner_type === ownerFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.model?.display_name?.toLowerCase().includes(q) ||
        b.color?.toLowerCase().includes(q)
      );
    }

    // Sorting uses the 24hr package as the reference price
    const priceOf = (b: BikeRow) => {
      const pkg = b.model?.packages?.find((p: any) => p.tier === '24hr');
      return pkg?.price ?? Infinity;
    };
    if (sort === 'price_asc') list.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === 'price_desc') list.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === 'rating') list.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));

    return list;
  }, [bikes, cat, sort, query, ownerFilter]);

  return (
    <section id="browse" className="max-w-7xl mx-auto px-6 py-14">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
            Find your ride
          </h2>
          <p className="text-muted mt-1 text-sm md:text-base">
            {filtered.length} {filtered.length === 1 ? 'bike' : 'bikes'} available right now
          </p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search by name or color…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-field max-w-xs"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as any)}
            className="input-field w-44"
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn('chip', cat === c.id && 'chip-active')}
          >
            <span className="mr-1.5">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Owner filter */}
      <div className="flex gap-2 mb-8 text-xs">
        <OwnerTab active={ownerFilter === 'all'} onClick={() => setOwnerFilter('all')}>
          All Sources
        </OwnerTab>
        <OwnerTab active={ownerFilter === 'platform'} onClick={() => setOwnerFilter('platform')}>
          Zodito Fleet
        </OwnerTab>
        <OwnerTab active={ownerFilter === 'vendor'} onClick={() => setOwnerFilter('vendor')}>
          Partner Vendors
        </OwnerTab>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <div className="text-5xl mb-3">🔍</div>
          <p>No bikes match your filters. Try widening your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(b => <BikeCard key={b.id} bike={b} />)}
        </div>
      )}
    </section>
  );
}

function OwnerTab({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-md font-medium uppercase tracking-wide transition-colors',
        active
          ? 'bg-primary text-white'
          : 'bg-border/50 text-muted hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}
