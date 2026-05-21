'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { VendorBikeCard } from './VendorBikeCard';
import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';

/**
 * Vendor portal dashboard. Mirrors the operator-facing pieces of /admin/bookings
 * that make sense for a vendor:
 *
 *   - Snapshot strip (Today / Week / Month) scoped to THIS vendor's bookings —
 *     pickups, returns due, completed rides, earnings collected, gross handled.
 *   - Sub-tabs over the bookings list: Active / Upcoming / Past. No Overdue
 *     tab — settlement is a platform-level decision, not the vendor's.
 *   - Search box (booking #, customer, bike).
 *
 * Settlement, cancellation, manual-creation, KYC review, refund — all live in
 * /admin and stay there. This portal is intentionally a read + light-touch
 * surface; financial state changes happen on the platform side.
 */

type Booking = any;

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-warning/15 text-warning',
  confirmed:       'bg-success/15 text-success',
  ongoing:         'bg-info/15 text-info',
  completed:       'bg-border text-muted',
  cancelled:       'bg-danger/10 text-danger',
  payment_failed:  'bg-danger/10 text-danger',
};

export function VendorDashboard({ data }: {
  data: { vendor: any; bikes: any[]; bookings: Booking[] };
}) {
  const { vendor, bikes, bookings } = data;

  const confirmedBookings = bookings.filter((b: any) =>
    ['confirmed', 'ongoing', 'completed'].includes(b.status));
  const totalGrossRevenue = confirmedBookings.reduce((s: number, b: any) => s + Number(b.total_amount ?? 0), 0);
  const totalVendorPayout = confirmedBookings.reduce((s: number, b: any) => s + Number(b.vendor_payout ?? 0), 0);
  const totalCommission   = confirmedBookings.reduce((s: number, b: any) => s + Number(b.platform_commission ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">{vendor.business_name}</h1>
          <p className="text-muted text-sm mt-1">📍 {vendor.pickup_area ?? '—'} · {bikes.length} bike{bikes.length === 1 ? '' : 's'} listed</p>
        </div>
        <Link href="/vendor/bikes/new" className="btn-accent text-sm">+ List a bike</Link>
      </div>

      {/* Today / Week / Month snapshot scoped to this vendor */}
      <SnapshotStrip bookings={bookings} vendor={vendor} />

      {/* Lifetime KPI cards — kept for the at-a-glance summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mb-8">
        <Kpi label="Lifetime payouts"   value={formatINR(totalVendorPayout)} sub={`${confirmedBookings.length} rides`} accent />
        <Kpi label="Active listings"    value={String(bikes.filter((b: any) => b.is_active && b.listing_status === 'approved').length)} sub={`${bikes.length} total`} />
        <Kpi label="Commission rate"    value={`${vendor.commission_pct}%`} sub="Platform fee" />
        <Kpi label="Gross handled"      value={formatINR(totalGrossRevenue)} sub={`incl. ${formatINR(totalCommission)} fees`} />
      </div>

      {/* My Bikes */}
      <section className="mb-8">
        <h2 className="font-display font-semibold text-lg mb-3">My bikes</h2>
        {bikes.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            <div className="text-4xl mb-2">🏍️</div>
            <p className="text-sm">No bikes listed yet.</p>
            <Link href="/vendor/bikes/new" className="btn-accent inline-block mt-4 text-sm">
              List your first bike
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bikes.map((b: any) => <VendorBikeCard key={b.id} bike={b} />)}
          </div>
        )}
      </section>

      <BookingsSection bookings={bookings} vendor={vendor} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotStrip — vendor-scoped version of /admin/bookings' summary.
// ─────────────────────────────────────────────────────────────────────────────
function SnapshotStrip({ bookings, vendor }: { bookings: Booking[]; vendor: any }) {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');

  // Same IST-aware boundary math as the admin strip.
  const now  = new Date();
  let from   = new Date(now);
  let to     = new Date(now);
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (range === 'week') {
    const day = (now.getDay() + 6) % 7; // Mon=0
    from.setDate(now.getDate() - day);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };

  const active = (b: any) => !['cancelled', 'payment_failed'].includes(b.status);
  const pickups   = bookings.filter(b => inRange(b.start_ts) && active(b)).length;
  const returns   = bookings.filter(b => inRange(b.end_ts)   && active(b)).length;
  const completed = bookings.filter(b => inRange(b.end_ts)   && b.status === 'completed').length;
  // Earnings recognised at start_ts so the strip shows "rides I'm running today
  // are worth ₹X to me." Matches what a partner expects on the GoBikes app.
  const earnings  = bookings
    .filter(b => inRange(b.start_ts) && active(b))
    .reduce((s, b: any) => s + Number(b.vendor_payout ?? 0), 0);
  const grossInRange = bookings
    .filter(b => inRange(b.start_ts) && active(b))
    .reduce((s, b: any) => s + Number(b.total_amount ?? 0), 0);

  const rangeLabel = range === 'today' ? 'today' : range === 'week' ? 'this week' : 'this month';

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Snapshot</p>
        <div className="inline-flex rounded-lg overflow-hidden border border-border text-[10px] font-bold">
          {(['today', 'week', 'month'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
                range === r ? 'bg-accent text-white' : 'bg-bg text-muted hover:bg-border/60'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <SnapCard label="Your earnings"  value={`₹${Math.round(earnings).toLocaleString('en-IN')}`}     sub={`payout ${rangeLabel}`} accent />
        <SnapCard label="Pickups"        value={String(pickups)}                                       sub={rangeLabel} />
        <SnapCard label="Returns due"    value={String(returns)}                                       sub={rangeLabel} />
        <SnapCard label="Completed"      value={String(completed)}                                     sub={rangeLabel} />
        <SnapCard label="Gross handled"  value={`₹${Math.round(grossInRange).toLocaleString('en-IN')}`} sub={`incl. ${vendor.commission_pct}% fee`} />
      </div>
    </div>
  );
}

function SnapCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-bg/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display font-bold text-lg leading-tight mt-0.5 ${accent ? 'text-accent' : 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BookingsSection — sub-tabs (Active/Upcoming/Past) + search.
// ─────────────────────────────────────────────────────────────────────────────
function BookingsSection({ bookings, vendor }: { bookings: Booking[]; vendor: any }) {
  const [view, setView]     = useState<'all' | 'active' | 'upcoming' | 'past'>('all');
  const [search, setSearch] = useState('');

  const now = Date.now();
  function bucketOf(b: any): 'active' | 'upcoming' | 'past' {
    if (b.status === 'ongoing') return 'active';
    if (b.status === 'confirmed' || b.status === 'pending_payment') return 'upcoming';
    return 'past'; // completed / cancelled / payment_failed
  }

  const counts = useMemo(() => {
    const c = { active: 0, upcoming: 0, past: 0 };
    bookings.forEach((b: any) => { c[bucketOf(b)]++; });
    return c;
  }, [bookings, now]);

  const filtered = bookings.filter((b: any) => {
    if (view !== 'all' && bucketOf(b) !== view) return false;
    if (search) {
      const q = search.toLowerCase();
      const customer = b.user ? `${b.user.first_name ?? ''} ${b.user.last_name ?? ''}`.trim() : '';
      return (
        (b.booking_number ?? '').toLowerCase().includes(q) ||
        customer.toLowerCase().includes(q) ||
        (b.user?.phone ?? '').toLowerCase().includes(q) ||
        (b.user?.email ?? '').toLowerCase().includes(q) ||
        (b.bike?.model?.display_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const VIEWS = [
    { key: 'all'      as const, label: 'All',      badge: bookings.length },
    { key: 'active'   as const, label: 'Active',   badge: counts.active   },
    { key: 'upcoming' as const, label: 'Upcoming', badge: counts.upcoming },
    { key: 'past'     as const, label: 'Past',     badge: counts.past     },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-display font-semibold text-lg">Bookings</h2>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search booking #, customer, bike…"
          className="input-field text-sm max-w-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {VIEWS.map(v => {
          const isActive = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${
                isActive ? 'bg-accent text-white' : 'bg-border/60 text-muted hover:bg-border'
              }`}
            >
              {v.label}
              {v.badge > 0 && (
                <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20' : 'bg-muted/20'}`}>
                  {v.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm">
          {bookings.length === 0
            ? 'No bookings yet. Once customers book your bikes, they\'ll appear here.'
            : 'No bookings match your filters.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <Th>Booking</Th>
                  <Th>Customer</Th>
                  <Th>Bike</Th>
                  <Th>Period</Th>
                  <Th>Gross</Th>
                  <Th className="text-success">Your payout</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b: any) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-bg/50">
                    <Td>
                      <div className="font-semibold">#{b.booking_number ?? b.id.slice(-6)}</div>
                      <div className="text-[11px] text-muted">{TIER_LABELS[b.package_tier as keyof typeof TIER_LABELS]}</div>
                    </Td>
                    <Td>
                      {b.user ? (
                        <>
                          <div className="font-semibold">
                            {b.user.first_name} {b.user.last_name}
                          </div>
                          {b.payment_status === 'paid' && b.user.phone && (
                            <a href={`tel:${b.user.phone}`} className="text-[11px] text-accent">{b.user.phone}</a>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-lg mr-1">{b.bike?.emoji}</span>
                      {b.bike?.model?.display_name}
                    </Td>
                    <Td className="text-xs">
                      <div>{formatDateTime(b.start_ts)}</div>
                      <div className="text-muted">→ {formatDateTime(b.end_ts)}</div>
                    </Td>
                    <Td>{formatINR(b.total_amount ?? 0)}</Td>
                    <Td className="font-bold text-success">{formatINR(b.vendor_payout ?? 0)}</Td>
                    <Td>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${STATUS_STYLES[b.status] ?? 'bg-border'}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lifetime financial summary — moved into this section so the strip
          above stays focused on the chosen time range. */}
      {bookings.length > 0 && (
        <div className="mt-4 p-4 bg-accent/5 border border-accent/20 rounded-card text-sm grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Lifetime gross</div>
            <div className="font-display font-bold text-lg">
              {formatINR(bookings.filter((b: any) => !['cancelled', 'payment_failed'].includes(b.status)).reduce((s: number, b: any) => s + Number(b.total_amount ?? 0), 0))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Platform fee ({vendor.commission_pct}%)</div>
            <div className="font-display font-bold text-lg text-muted">
              −{formatINR(bookings.filter((b: any) => !['cancelled', 'payment_failed'].includes(b.status)).reduce((s: number, b: any) => s + Number(b.platform_commission ?? 0), 0))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Net to you</div>
            <div className="font-display font-bold text-lg text-success">
              {formatINR(bookings.filter((b: any) => !['cancelled', 'payment_failed'].includes(b.status)).reduce((s: number, b: any) => s + Number(b.vendor_payout ?? 0), 0))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-display font-bold text-2xl mt-0.5 ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[10px] font-semibold text-muted uppercase tracking-wide px-4 py-3 ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className ?? ''}`}>{children}</td>;
}
