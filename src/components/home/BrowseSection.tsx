'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { BikeCard } from './BikeCard';
import { cn } from '@/lib/utils';
import type { BikeCategory } from '@/lib/supabase/types';

type BikeRow = any;

const CATEGORIES: Array<{ id: BikeCategory | 'all'; label: string; icon: string }> = [
  { id: 'all', label: 'All Bikes', icon: '🏍️' },
  { id: 'scooter', label: 'Scooters', icon: '🛵' },
  { id: 'bike_sub150', label: '125–150cc', icon: '🏍️' },
  { id: 'bike_plus150', label: '150cc+', icon: '🏁' },
];

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low → High' },
  { id: 'price_desc', label: 'Price: High → Low' },
];

const DURATIONS = [
  { label: '3 hrs',  hrs: 3 },
  { label: '6 hrs',  hrs: 6 },
  { label: '12 hrs', hrs: 12 },
  { label: '1 day',  hrs: 24 },
  { label: '2 days', hrs: 48 },
  { label: '3 days', hrs: 72 },
  { label: '7 days', hrs: 168 },
  { label: '15 days', hrs: 360 },
  { label: '30 days', hrs: 720 },
];

function defaultFrom() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getMinutes() % 30 + 30, 0, 0); // round up to next 30-min
  return d.toISOString().slice(0, 16);
}
function defaultTo(from: string) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 16);
}

export function BrowseSection({ bikes: initialBikes }: { bikes: BikeRow[] }) {
  const [fromVal, setFromVal] = useState(() => defaultFrom());
  const [toVal, setToVal] = useState(() => defaultTo(defaultFrom()));
  const [availableBikes, setAvailableBikes] = useState<BikeRow[] | null>(null);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [cat, setCat] = useState<(typeof CATEGORIES)[number]['id']>('all');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'platform' | 'vendor'>('all');

  const bikes = availableBikes ?? initialBikes;

  const fetchAvailable = useCallback(async (from: string, to: string) => {
    setDateError(null);
    if (new Date(to) <= new Date(from)) {
      setDateError('Drop-off must be after pickup');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bikes/available?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`);
      const data = await res.json();
      if (res.ok) {
        setAvailableBikes(data.bikes);
        setUnavailableCount(data.unavailable_count ?? 0);
        setSearched(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSearch() {
    fetchAvailable(fromVal, toVal);
  }

  function handleClear() {
    setAvailableBikes(null);
    setUnavailableCount(0);
    setSearched(false);
    setFromVal(defaultFrom());
    setToVal(defaultTo(defaultFrom()));
  }

  const filtered = useMemo(() => {
    let list = bikes.slice();
    if (cat !== 'all') list = list.filter((b: BikeRow) => b.model?.category === cat);
    if (ownerFilter !== 'all') list = list.filter((b: BikeRow) => b.owner_type === ownerFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((b: BikeRow) =>
        b.model?.display_name?.toLowerCase().includes(q) ||
        b.color?.toLowerCase().includes(q)
      );
    }
    const priceOf = (b: BikeRow) => b.model?.packages?.find((p: any) => p.tier === '24hr')?.price ?? Infinity;
    if (sort === 'price_asc') list.sort((a: BikeRow, b: BikeRow) => priceOf(a) - priceOf(b));
    else if (sort === 'price_desc') list.sort((a: BikeRow, b: BikeRow) => priceOf(b) - priceOf(a));
    return list;
  }, [bikes, cat, sort, query, ownerFilter]);

  const nowStr = new Date().toISOString().slice(0, 16);

  // Which duration chip is active (null if user manually set a custom range)
  const activeDurationHrs = useMemo(() => {
    if (!fromVal || !toVal) return null;
    const diff = Math.round((new Date(toVal).getTime() - new Date(fromVal).getTime()) / (1000 * 60 * 60));
    return DURATIONS.find(d => d.hrs === diff)?.hrs ?? null;
  }, [fromVal, toVal]);

  function applyDuration(hrs: number) {
    if (!fromVal) return;
    const to = new Date(new Date(fromVal).getTime() + hrs * 60 * 60 * 1000);
    setToVal(to.toISOString().slice(0, 16));
  }

  return (
    <section id="browse" className="max-w-7xl mx-auto px-4 md:px-6 py-10">

      {/* ── Date/time availability search ── */}
      <div className="bg-gradient-to-r from-primary to-primary/90 rounded-2xl p-4 md:p-6 mb-8 shadow-lg">
        <div className="text-white font-display font-semibold text-lg mb-3">
          🗓 When do you want to ride?
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">Pickup</label>
            <input
              type="datetime-local"
              value={fromVal}
              min={nowStr}
              onChange={e => {
                const newFrom = e.target.value;
                setFromVal(newFrom);
                if (newFrom) {
                  if (activeDurationHrs) {
                    // keep same duration
                    const to = new Date(new Date(newFrom).getTime() + activeDurationHrs * 60 * 60 * 1000);
                    setToVal(to.toISOString().slice(0, 16));
                  } else if (toVal && new Date(toVal) <= new Date(newFrom)) {
                    setToVal(defaultTo(newFrom));
                  }
                }
              }}
              className="w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">Drop-off</label>
            <input
              type="datetime-local"
              value={toVal}
              min={fromVal || nowStr}
              onChange={e => setToVal(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
            />
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking…</>
              ) : '🔍 Check Availability'}
            </button>
            {searched && (
              <button onClick={handleClear} className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors">
                ✕
              </button>
            )}
          </div>
        </div>
        {/* Duration quick-select */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {DURATIONS.map(d => (
            <button
              key={d.hrs}
              onClick={() => applyDuration(d.hrs)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border',
                activeDurationHrs === d.hrs
                  ? 'bg-accent border-accent text-white'
                  : 'bg-white/10 border-white/15 text-white/75 hover:bg-white/20 hover:text-white'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {dateError && <p className="text-red-300 text-xs mt-2">{dateError}</p>}
        {searched && !loading && (
          <div className="mt-3 text-sm text-white/80">
            <span className="text-accent font-semibold">{filtered.length} bike{filtered.length !== 1 ? 's' : ''} available</span>
            {unavailableCount > 0 && <span className="ml-2 text-white/50">({unavailableCount} unavailable for this period)</span>}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight">Find your ride</h2>
          <p className="text-muted mt-1 text-sm md:text-base">
            {searched ? `${filtered.length} available for your dates` : `${filtered.length} bikes listed`}
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
          <select value={sort} onChange={e => setSort(e.target.value)} className="input-field w-44">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn('chip', cat === c.id && 'chip-active')}>
            <span className="mr-1.5">{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-8 text-xs">
        {(['all', 'platform', 'vendor'] as const).map(o => (
          <button key={o} onClick={() => setOwnerFilter(o)}
            className={cn('px-3 py-1 rounded-md font-medium uppercase tracking-wide transition-colors',
              ownerFilter === o ? 'bg-primary text-white' : 'bg-border/50 text-muted hover:text-primary')}>
            {o === 'all' ? 'All Sources' : o === 'platform' ? 'Zodito Fleet' : 'Partner Vendors'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <div className="text-5xl mb-3">{searched ? '🔒' : '🔍'}</div>
          <p className="font-semibold mb-1">{searched ? 'No bikes available for these dates' : 'No bikes match your filters'}</p>
          {searched && <p className="text-sm">Try different pickup/drop-off times, or <button onClick={handleClear} className="text-accent underline">view all bikes</button></p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((b: BikeRow) => <BikeCard key={b.id} bike={b} searchFrom={searched ? fromVal : undefined} searchTo={searched ? toVal : undefined} />)}
        </div>
      )}
    </section>
  );
}
