'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { BikeCard } from './BikeCard';
import { cn } from '@/lib/utils';
import type { BikeCategory } from '@/lib/supabase/types';

type BikeRow = any;
type VehicleType = 'all' | 'scooter' | 'motorcycle';

const VEHICLE_TYPES: Array<{ id: VehicleType; label: string; icon: string }> = [
  { id: 'all',        label: 'All',         icon: '🚗' },
  { id: 'scooter',    label: 'Scooters',    icon: '🛵' },
  { id: 'motorcycle', label: 'Motorcycles', icon: '🏍️' },
];

const CC_FILTERS: Array<{ id: BikeCategory | 'all'; label: string }> = [
  { id: 'all',          label: 'All CC' },
  { id: 'bike_sub125',  label: '< 125cc' },
  { id: 'bike_sub150',  label: '125–150cc' },
  { id: 'bike_plus150', label: '150cc+' },
];

const SORTS = [
  { id: 'newest',     label: 'Newest' },
  { id: 'price_asc',  label: 'Price: Low → High' },
  { id: 'price_desc', label: 'Price: High → Low' },
];

const DURATIONS = [
  { label: '12 hrs',  hrs: 12 },
  { label: '24 hrs',  hrs: 24 },
  { label: '2 days',  hrs: 48 },
  { label: '3 days',  hrs: 72 },
  { label: '4 days',  hrs: 96 },
  { label: '5 days',  hrs: 120 },
  { label: '6 days',  hrs: 144 },
  { label: '7 days',  hrs: 168 },
  { label: '15 days', hrs: 360 },
  { label: '30 days', hrs: 720 },
];

const PICKUP_OPEN  = 6;   // 6 AM
const PICKUP_CLOSE = 22;  // 10 PM

// hour options for the select dropdowns
const HOUR_OPTIONS = Array.from({ length: PICKUP_CLOSE - PICKUP_OPEN + 1 }, (_, i) => {
  const h = i + PICKUP_OPEN;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: h, label: `${h12} ${period}` };
});

// Build a "YYYY-MM-DDTHH:00" local-time string (no minutes ever)
function toLocalStr(d: Date): string {
  const z = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:00`;
}

// Extract the date part "YYYY-MM-DD" from a local string
function datePart(s: string) { return s.slice(0, 10); }

// Extract the hour number from a local string
function hourPart(s: string) { return parseInt(s.slice(11, 13), 10) || PICKUP_OPEN; }

// Combine a date string + hour into a local datetime string
function combine(date: string, hour: number): string {
  const z = (n: number) => n.toString().padStart(2, '0');
  return `${date}T${z(hour)}:00`;
}

// Only show hours that haven't passed yet (when the selected date is today)
function availableHours(dateStr: string) {
  if (dateStr !== todayDateStr()) return HOUR_OPTIONS;
  const currentHour = new Date().getHours();
  return HOUR_OPTIONS.filter(o => o.value > currentHour);
}

function todayDateStr(): string {
  const d = new Date();
  const z = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function defaultFrom() {
  const d = new Date();
  let h = d.getMinutes() > 0 ? d.getHours() + 2 : d.getHours() + 1;
  if (h < PICKUP_OPEN) h = PICKUP_OPEN;
  if (h > PICKUP_CLOSE) {
    // push to tomorrow's open
    const tom = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return toLocalStr(new Date(tom.getFullYear(), tom.getMonth(), tom.getDate(), PICKUP_OPEN));
  }
  return toLocalStr(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h));
}

function defaultTo(from: string, hrs = 24) {
  return toLocalStr(new Date(new Date(from).getTime() + hrs * 60 * 60 * 1000));
}

function HourPicker({ value, options, onChange }: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (h: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value) ?? options[0];
  return (
    <div className="relative w-24 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full rounded-xl border border-white/30 bg-black/30 text-white px-3 py-2.5 text-sm font-medium flex items-center justify-between gap-1"
      >
        <span>{selected?.label ?? '—'}</span>
        <span className="text-white/60 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 w-28 bg-white border border-border rounded-xl shadow-xl z-50 overflow-y-auto max-h-52">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  o.value === value ? 'bg-accent text-white font-semibold' : 'text-primary hover:bg-accent/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BrowseSection({ bikes: initialBikes }: { bikes: BikeRow[] }) {
  const [fromVal, setFromVal] = useState(() => defaultFrom());
  const [toVal, setToVal] = useState(() => defaultTo(defaultFrom()));
  const [availableBikes, setAvailableBikes] = useState<BikeRow[] | null>(null);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [loading, setLoading] = useState(true); // true until first availability check completes
  const [searched, setSearched] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [vehicleType, setVehicleType] = useState<VehicleType>('all');
  const [ccFilter, setCcFilter] = useState<(typeof CC_FILTERS)[number]['id']>('all');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'platform' | 'vendor'>('all');

  const [showCustom, setShowCustom] = useState(false);
  const [customHrsInput, setCustomHrsInput] = useState('');

  // Never show the unfiltered initialBikes — wait for the availability check to complete
  const bikes = availableBikes ?? [];

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

  // Auto-search on mount so homepage never shows already-booked bikes
  useEffect(() => {
    fetchAvailable(fromVal, toVal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClear() {
    setAvailableBikes(null);
    setUnavailableCount(0);
    setSearched(false);
    setFromVal(defaultFrom());
    setToVal(defaultTo(defaultFrom()));
  }

  const filtered = useMemo(() => {
    let list = bikes.slice();
    // Vehicle type filter
    if (vehicleType === 'scooter')    list = list.filter((b: BikeRow) => b.model?.category === 'scooter');
    if (vehicleType === 'motorcycle') list = list.filter((b: BikeRow) => b.model?.category !== 'scooter');
    // CC sub-filter (only when showing motorcycles or all)
    if (ccFilter !== 'all' && vehicleType !== 'scooter') list = list.filter((b: BikeRow) => b.model?.category === ccFilter);
    if (ownerFilter !== 'all') list = list.filter((b: BikeRow) => b.owner_type === ownerFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((b: BikeRow) =>
        b.model?.display_name?.toLowerCase().includes(q) ||
        b.color?.toLowerCase().includes(q)
      );
    }
    const priceOf = (b: BikeRow) => b.model?.packages?.find((p: any) => p.tier === '24hr')?.price ?? Infinity;
    if (sort === 'price_asc')  list.sort((a: BikeRow, b: BikeRow) => priceOf(a) - priceOf(b));
    else if (sort === 'price_desc') list.sort((a: BikeRow, b: BikeRow) => priceOf(b) - priceOf(a));
    return list;
  }, [bikes, vehicleType, ccFilter, sort, query, ownerFilter]);

  // Which duration chip is active (null if user manually set a custom range)
  const activeDurationHrs = useMemo(() => {
    if (!fromVal || !toVal) return null;
    const diff = Math.round((new Date(toVal).getTime() - new Date(fromVal).getTime()) / (1000 * 60 * 60));
    return DURATIONS.find(d => d.hrs === diff)?.hrs ?? null;
  }, [fromVal, toVal]);

  function applyDuration(hrs: number) {
    if (!fromVal) return;
    setToVal(defaultTo(fromVal, hrs));
  }

  function applyCustomDuration() {
    const hrs = parseInt(customHrsInput, 10);
    if (!hrs || hrs < 12 || hrs > 720) return;
    applyDuration(hrs);
    setShowCustom(false);
    setCustomHrsInput('');
  }

  return (
    <section id="browse" className="max-w-7xl mx-auto px-4 md:px-6 py-10">

      {/* ── Date/time availability search ── */}
      <div className="bg-gradient-to-r from-primary to-primary/90 rounded-2xl p-4 md:p-6 mb-8 shadow-lg">
        <div className="text-white font-display font-semibold text-lg mb-3">
          🗓 When do you want to ride?
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          {/* Pickup — date + hour select (no minutes) */}
          <div className="flex-1 min-w-0">
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">Pickup</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={datePart(fromVal)}
                min={todayDateStr()}
                onChange={e => {
                  const newDate = e.target.value;
                  if (!newDate) return;
                  const newFrom = combine(newDate, hourPart(fromVal));
                  setFromVal(newFrom);
                  if (activeDurationHrs) {
                    setToVal(defaultTo(newFrom, activeDurationHrs));
                  } else if (toVal && new Date(toVal) <= new Date(newFrom)) {
                    setToVal(defaultTo(newFrom));
                  }
                }}
                className="flex-1 min-w-0 rounded-xl border border-white/20 bg-white/10 text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
              />
              <HourPicker
                value={hourPart(fromVal)}
                options={availableHours(datePart(fromVal))}
                onChange={h => {
                  const newFrom = combine(datePart(fromVal), h);
                  setFromVal(newFrom);
                  if (activeDurationHrs) {
                    setToVal(defaultTo(newFrom, activeDurationHrs));
                  } else if (toVal && new Date(toVal) <= new Date(newFrom)) {
                    setToVal(defaultTo(newFrom));
                  }
                }}
              />
            </div>
          </div>

          {/* Drop-off — date + hour select (no minutes) */}
          <div className="flex-1 min-w-0">
            <label className="text-white/70 text-xs uppercase tracking-wide mb-1 block">Drop-off</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={datePart(toVal)}
                min={datePart(fromVal)}
                onChange={e => {
                  const newDate = e.target.value;
                  if (!newDate) return;
                  setToVal(combine(newDate, hourPart(toVal)));
                }}
                className="flex-1 min-w-0 rounded-xl border border-white/20 bg-white/10 text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
              />
              <HourPicker
                value={hourPart(toVal)}
                options={availableHours(datePart(toVal))}
                onChange={h => setToVal(combine(datePart(toVal), h))}
              />
            </div>
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
        <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5 -mx-1 px-1 items-center" style={{ scrollbarWidth: 'none' }}>
          {/* Custom duration — first */}
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border',
                activeDurationHrs === null && fromVal && toVal
                  ? 'bg-accent border-accent text-white'
                  : 'bg-white/10 border-white/15 text-white/75 hover:bg-white/20 hover:text-white'
              )}
            >
              Custom
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min={12}
                max={720}
                value={customHrsInput}
                onChange={e => setCustomHrsInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustomDuration()}
                placeholder="hrs"
                autoFocus
                className="w-16 px-2 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-accent [color-scheme:dark]"
              />
              <button
                onClick={applyCustomDuration}
                className="px-2.5 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90"
              >
                Go
              </button>
              <button
                onClick={() => { setShowCustom(false); setCustomHrsInput(''); }}
                className="text-white/60 hover:text-white text-sm leading-none px-1"
              >
                ✕
              </button>
            </div>
          )}

          {DURATIONS.map(d => (
            <button
              key={d.hrs}
              onClick={() => { applyDuration(d.hrs); setShowCustom(false); }}
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
            {searched
              ? `${filtered.length} ${vehicleType === 'scooter' ? 'scooter' : vehicleType === 'motorcycle' ? 'motorcycle' : 'vehicle'}${filtered.length !== 1 ? 's' : ''} available for your dates`
              : `${filtered.length} ${vehicleType === 'scooter' ? 'scooter' : vehicleType === 'motorcycle' ? 'motorcycle' : 'vehicle'}${filtered.length !== 1 ? 's' : ''} listed`}
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

      {/* Vehicle type — top-level tabs */}
      <div className="flex gap-1 mb-3 p-1 bg-border/30 rounded-xl w-fit">
        {VEHICLE_TYPES.map(v => (
          <button
            key={v.id}
            onClick={() => { setVehicleType(v.id); setCcFilter('all'); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              vehicleType === v.id
                ? 'bg-white shadow text-primary'
                : 'text-muted hover:text-primary'
            )}
          >
            <span>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      {/* CC sub-filter — only shown for motorcycles */}
      {vehicleType !== 'scooter' && (
        <div className="flex flex-wrap gap-2 mb-3">
          {CC_FILTERS.map(c => (
            <button key={c.id} onClick={() => setCcFilter(c.id)} className={cn('chip', ccFilter === c.id && 'chip-active')}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-8 text-xs">
        {(['all', 'platform', 'vendor'] as const).map(o => (
          <button key={o} onClick={() => setOwnerFilter(o)}
            className={cn('px-3 py-1 rounded-md font-medium uppercase tracking-wide transition-colors',
              ownerFilter === o ? 'bg-primary text-white' : 'bg-border/50 text-muted hover:text-primary')}>
            {o === 'all' ? 'All Sources' : o === 'platform' ? 'Zodito Fleet' : 'Partner Vendors'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-40 bg-border/40 rounded-lg mb-3" />
              <div className="h-4 bg-border/40 rounded w-3/4 mb-2" />
              <div className="h-3 bg-border/30 rounded w-1/2 mb-4" />
              <div className="h-8 bg-border/30 rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
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
