'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR, formatDateTime, cn } from '@/lib/utils';

export function BookingsTab({ bookings }: { bookings: any[] }) {
  const [filter, setFilter] = useState<'all' | 'pending_payment' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled' | 'payment_failed'>('all');
  const [search, setSearch] = useState('');

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
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => <BookingRow key={b.id} booking={b} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function BookingRow({ booking }: { booking: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

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
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  const statusStyles: Record<string, string> = {
    pending_payment: 'bg-warning/15 text-warning',
    confirmed: 'bg-success/15 text-success',
    ongoing: 'bg-info/15 text-info',
    completed: 'bg-border text-muted',
    cancelled: 'bg-danger/10 text-danger',
    payment_failed: 'bg-danger/10 text-danger',
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-bg/50">
      <Td>
        <div className="font-semibold">#{booking.booking_number ?? booking.id.slice(-6)}</div>
        <div className="text-[10px] text-muted uppercase">{booking.package_tier}</div>
      </Td>
      <Td>
        <div className="font-semibold">
          {booking.user?.first_name} {booking.user?.last_name}
        </div>
        {booking.user?.phone && (
          <a href={`tel:${booking.user.phone}`} className="text-[11px] text-accent">
            {booking.user.phone}
          </a>
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
      </Td>
      <Td className="font-bold">{formatINR(booking.total_amount ?? 0)}</Td>
      <Td>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md whitespace-nowrap ${statusStyles[booking.status]}`}>
          {booking.status.replace('_', ' ')}
        </span>
      </Td>
      <Td>
        <div className="flex flex-col gap-1">
          {booking.status === 'confirmed' && (
            <ActionBtn onClick={() => changeStatus('ongoing')} loading={loading === 'ongoing'}>
              Mark picked up
            </ActionBtn>
          )}
          {booking.status === 'ongoing' && (
            <ActionBtn onClick={() => changeStatus('completed')} loading={loading === 'completed'}>
              Mark returned
            </ActionBtn>
          )}
          {(booking.status === 'confirmed' || booking.status === 'pending_payment') && (
            <ActionBtn onClick={() => changeStatus('cancelled')} loading={loading === 'cancelled'} danger>
              Cancel
            </ActionBtn>
          )}
          {(booking.status === 'cancelled' || booking.status === 'payment_failed') && booking.payment_status === 'paid' && (
            <ActionBtn onClick={() => changeStatus('refunded')} loading={loading === 'refunded'}>
              Mark refunded
            </ActionBtn>
          )}
        </div>
      </Td>
    </tr>
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
        active
          ? 'bg-primary text-white'
          : 'bg-border/50 text-muted hover:text-primary',
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

function ActionBtn({
  children, onClick, loading, danger,
}: { children: React.ReactNode; onClick: () => void; loading?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'text-[11px] font-semibold px-2 py-1 rounded-md transition-colors whitespace-nowrap',
        danger
          ? 'border border-danger/30 text-danger hover:bg-danger/5'
          : 'bg-primary text-white hover:bg-primary-soft',
        loading && 'opacity-50'
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
