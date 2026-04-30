'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR, formatDateTime, cn } from '@/lib/utils';

export function BookingsTab({ bookings }: { bookings: any[] }) {
  const [filter, setFilter] = useState<'all' | 'pending_payment' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled' | 'payment_failed'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const filtered = useMemo(() => {
    let list = bookings;
    if (filter !== 'all') list = list.filter(b => b.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.booking_number?.toLowerCase().includes(q) ||
        b.user?.first_name?.toLowerCase().includes(q) ||
        b.user?.last_name?.toLowerCase().includes(q) ||
        b.user?.phone?.includes(q)
      );
    }
    return list;
  }, [bookings, filter, search]);

  const counts = useMemo(() => ({
    all: bookings.length,
    pending_payment: bookings.filter(b => b.status === 'pending_payment').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    ongoing: bookings.filter(b => b.status === 'ongoing').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    payment_failed: bookings.filter(b => b.status === 'payment_failed').length,
  }), [bookings]);

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap text-xs">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>All</FilterChip>
        <FilterChip active={filter === 'pending_payment'} onClick={() => setFilter('pending_payment')} count={counts.pending_payment}>Pending</FilterChip>
        <FilterChip active={filter === 'confirmed'} onClick={() => setFilter('confirmed')} count={counts.confirmed}>Confirmed</FilterChip>
        <FilterChip active={filter === 'ongoing'} onClick={() => setFilter('ongoing')} count={counts.ongoing}>Ongoing</FilterChip>
        <FilterChip active={filter === 'completed'} onClick={() => setFilter('completed')} count={counts.completed}>Completed</FilterChip>
        <FilterChip active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} count={counts.cancelled}>Cancelled</FilterChip>
        <FilterChip active={filter === 'payment_failed'} onClick={() => setFilter('payment_failed')} count={counts.payment_failed} danger>Refund Review</FilterChip>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search booking #, customer name, phone…"
        className="input-field mb-4 max-w-md"
      />

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <p className="text-sm">No bookings match</p>
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
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Location</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <BookingRow key={b.id} booking={b} onSelect={() => setSelected(b)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <BookingDetailDrawer
        booking={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

/* ─── Row ─────────────────────────────────────────────────────────────────── */

function BookingRow({ booking, onSelect }: { booking: any; onSelect: () => void }) {
  const statusStyles: Record<string, string> = {
    pending_payment: 'bg-warning/15 text-warning',
    confirmed: 'bg-success/15 text-success',
    ongoing: 'bg-info/15 text-info',
    completed: 'bg-border text-muted',
    cancelled: 'bg-danger/10 text-danger',
    payment_failed: 'bg-danger/10 text-danger',
  };

  const hasGps = booking.booking_lat != null && booking.booking_lng != null;
  const hasIp  = !!booking.booking_ip;

  return (
    <tr
      className="border-b border-border last:border-0 hover:bg-accent/5 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <Td>
        <div className="font-semibold">#{booking.booking_number ?? booking.id.slice(-6)}</div>
        <div className="text-[10px] text-muted uppercase">{booking.package_tier}</div>
      </Td>
      <Td>
        <div className="font-semibold">
          {booking.source === 'manual'
            ? (booking.customer_name ?? '—')
            : `${booking.user?.first_name ?? ''} ${booking.user?.last_name ?? ''}`.trim() || '—'}
        </div>
        {booking.user?.phone && (
          <div className="text-[11px] text-accent">{booking.user.phone}</div>
        )}
      </Td>
      <Td>
        <span className="text-lg mr-1">{booking.bike?.emoji}</span>
        {booking.bike?.model?.display_name}
        {booking.bike?.owner_type === 'vendor' && (
          <div className="text-[10px] text-muted">Partner bike</div>
        )}
      </Td>
      <Td className="text-xs whitespace-nowrap">
        <div>{formatDateTime(booking.start_ts)}</div>
        <div className="text-muted">→ {formatDateTime(booking.end_ts)}</div>
        {booking.created_at && (
          <div className="text-[10px] text-muted/60 mt-0.5">
            Booked {formatDateTime(booking.created_at)}
          </div>
        )}
      </Td>
      <Td className="font-bold">{formatINR(booking.total_amount ?? 0)}</Td>
      <Td>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md whitespace-nowrap ${statusStyles[booking.status] ?? 'bg-border'}`}>
          {booking.status.replace('_', ' ')}
        </span>
      </Td>
      {/* Location summary — click the row for full detail */}
      <Td>
        {booking.source === 'manual' ? (
          <span className="text-[11px] text-muted">⌨️ Admin entry</span>
        ) : hasGps ? (
          <span className="text-[11px] text-accent font-medium">📍 GPS</span>
        ) : hasIp ? (
          <span className="text-[11px] text-muted">🌐 IP only</span>
        ) : (
          <span className="text-[11px] text-muted/40">—</span>
        )}
      </Td>
    </tr>
  );
}

/* ─── Detail drawer ────────────────────────────────────────────────────────── */

function BookingDetailDrawer({ booking, onClose }: { booking: any | null; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  if (!booking) return null;

  async function changeStatus(to: string) {
    const reason = (to === 'cancelled' || to === 'refunded')
      ? window.prompt(`Reason for ${to}:`) || ''
      : '';
    setLoading(to);
    try {
      const res = await fetch('/api/admin/bookings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, status: to, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed');
      } else {
        onClose();
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  }

  const hasGps = booking.booking_lat != null && booking.booking_lng != null;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${booking.booking_lat},${booking.booking_lng}`
    : null;

  const statusStyles: Record<string, string> = {
    pending_payment: 'bg-warning/15 text-warning',
    confirmed: 'bg-success/15 text-success',
    ongoing: 'bg-info/15 text-info',
    completed: 'bg-border text-muted',
    cancelled: 'bg-danger/10 text-danger',
    payment_failed: 'bg-danger/10 text-danger',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[200]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[201] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="font-display font-bold text-lg">
              #{booking.booking_number ?? booking.id.slice(-6)}
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${statusStyles[booking.status] ?? 'bg-border'}`}>
              {booking.status.replace('_', ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-bg flex items-center justify-center text-muted hover:text-primary transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Customer */}
          <Section title="Customer">
            <Row label="Name" value={
              booking.source === 'manual'
                ? (booking.customer_name ?? '—')
                : `${booking.user?.first_name ?? ''} ${booking.user?.last_name ?? ''}`.trim() || '—'
            } />
            {booking.user?.phone && (
              <Row label="Phone">
                <a href={`tel:${booking.user.phone}`} className="text-accent font-medium">
                  {booking.user.phone}
                </a>
              </Row>
            )}
            {booking.source === 'manual' && booking.customer_phone && (
              <Row label="Phone">
                <a href={`tel:${booking.customer_phone}`} className="text-accent font-medium">
                  {booking.customer_phone}
                </a>
              </Row>
            )}
          </Section>

          {/* Bike */}
          <Section title="Bike">
            <Row label="Model" value={
              `${booking.bike?.emoji ?? ''} ${booking.bike?.model?.display_name ?? '—'}`.trim()
            } />
            {booking.bike?.owner_type === 'vendor' && (
              <Row label="Type" value="Partner bike" />
            )}
          </Section>

          {/* Rental period */}
          <Section title="Rental Period">
            <Row label="Package" value={booking.package_tier} />
            <Row label="Pickup" value={formatDateTime(booking.start_ts)} />
            <Row label="Drop-off" value={formatDateTime(booking.end_ts)} />
            <Row label="Booked at" value={formatDateTime(booking.created_at)} />
          </Section>

          {/* Payment */}
          <Section title="Payment">
            <Row label="Total" value={formatINR(booking.total_amount ?? 0)} bold />
            <Row label="Payment" value={booking.payment_status?.replace('_', ' ') ?? '—'} />
            {booking.source === 'manual' && (
              <Row label="Source" value="Manual (admin created)" />
            )}
          </Section>

          {/* ── Location — the centrepiece ── */}
          <div className="rounded-xl border-2 overflow-hidden"
            style={{ borderColor: hasGps ? '#f97316' : '#e5e7eb' }}>
            <div className={`px-4 py-2.5 flex items-center gap-2 ${hasGps ? 'bg-accent text-white' : 'bg-bg border-b border-border'}`}>
              <span className="text-sm font-bold">
                {hasGps ? '📍 Booking Location — GPS' : booking.booking_ip ? '🌐 Booking Location — IP Only' : '◌ Booking Location'}
              </span>
            </div>
            <div className="p-4 bg-white">
              {booking.source === 'manual' ? (
                <p className="text-sm text-muted">This booking was created manually by an admin — no customer location was captured.</p>
              ) : hasGps ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Coordinates</div>
                    <div className="font-mono text-sm bg-bg border border-border rounded-lg px-3 py-2 select-all">
                      {booking.booking_lat.toFixed(6)}, {booking.booking_lng.toFixed(6)}
                    </div>
                  </div>
                  <a
                    href={mapsUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent text-white font-semibold rounded-xl text-sm hover:bg-accent/90 transition-colors"
                  >
                    📍 Open in Google Maps
                  </a>
                  {booking.booking_ip && (
                    <div>
                      <div className="text-[10px] text-muted uppercase tracking-wide mb-1">IP Address</div>
                      <div className="font-mono text-xs text-muted">{booking.booking_ip}</div>
                    </div>
                  )}
                </div>
              ) : booking.booking_ip ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted">GPS was denied or unavailable. IP address captured instead.</p>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-1">IP Address</div>
                    <div className="font-mono text-sm bg-bg border border-border rounded-lg px-3 py-2 select-all">
                      {booking.booking_ip}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    You can look up the approximate location of this IP at{' '}
                    <a
                      href={`https://ipinfo.io/${booking.booking_ip}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      ipinfo.io
                    </a>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">No location data was captured for this booking.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {(booking.status === 'confirmed' || booking.status === 'ongoing' ||
            booking.status === 'pending_payment' ||
            ((booking.status === 'cancelled' || booking.status === 'payment_failed') && booking.payment_status === 'paid')
          ) && (
            <Section title="Actions">
              <div className="flex flex-col gap-2">
                {booking.status === 'confirmed' && (
                  <ActionBtn onClick={() => changeStatus('ongoing')} loading={loading === 'ongoing'}>
                    ✓ Mark as Picked Up
                  </ActionBtn>
                )}
                {booking.status === 'ongoing' && (
                  <ActionBtn onClick={() => changeStatus('completed')} loading={loading === 'completed'}>
                    ✓ Mark as Returned
                  </ActionBtn>
                )}
                {(booking.status === 'confirmed' || booking.status === 'pending_payment') && (
                  <ActionBtn onClick={() => changeStatus('cancelled')} loading={loading === 'cancelled'} danger>
                    Cancel Booking
                  </ActionBtn>
                )}
                {(booking.status === 'cancelled' || booking.status === 'payment_failed') && booking.payment_status === 'paid' && (
                  <ActionBtn onClick={() => changeStatus('refunded')} loading={loading === 'refunded'}>
                    Mark as Refunded
                  </ActionBtn>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="bg-bg px-4 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, children }: { label: string; value?: string; bold?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted shrink-0">{label}</span>
      {children ?? <span className={bold ? 'font-bold text-base' : 'font-medium text-right'}>{value}</span>}
    </div>
  );
}

function FilterChip({
  active, onClick, count, children, danger,
}: { active: boolean; onClick: () => void; count: number; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md font-semibold uppercase tracking-wide transition-colors flex items-center gap-1.5',
        active ? 'bg-primary text-white' : 'bg-border/50 text-muted hover:text-primary',
        danger && !active && count > 0 && 'bg-danger/10 text-danger'
      )}
    >
      {children}
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', active ? 'bg-white/20' : 'bg-primary/10')}>
        {count}
      </span>
    </button>
  );
}

function ActionBtn({ children, onClick, loading, danger }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={cn(
        'w-full py-2.5 rounded-xl font-semibold text-sm transition-colors',
        danger
          ? 'border-2 border-danger text-danger hover:bg-danger/5'
          : 'bg-primary text-white hover:bg-primary/90',
        loading && 'opacity-50 cursor-not-allowed'
      )}
    >
      {loading ? '…' : children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wide px-4 py-3 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className ?? ''}`}>{children}</td>;
}
