'use client';

import { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Booking = {
  id: string;
  booking_number: string;
  status: 'confirmed' | 'ongoing';
  payment_status: string;
  total_amount: number;
  base_price: number;
  gst_amount: number;
  security_deposit: number;
  package_tier: string;
  start_ts: string;
  end_ts: string;
  picked_up_at: string | null;
  source: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  razorpay_payment_id: string | null;
  notes: string | null;
  bike_id: string;
  bike: {
    id: string; emoji: string; image_url: string | null;
    color: string | null; registration_number: string | null;
    model: { display_name: string; cc: number } | null;
  } | null;
  user: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | null;
};

type FleetBike = {
  id: string; emoji: string; image_url: string | null;
  color: string | null; registration_number: string | null; owner_type: string;
  freeze_reason: string | null;
  model: { display_name: string; cc: number } | null;
  fleetStatus: 'available' | 'confirmed' | 'ongoing' | 'overdue' | 'frozen';
  booking: Booking | null;
};

type BikeOption = {
  id: string; emoji: string; registration_number: string | null;
  model: { display_name: string } | null;
};

const EXPENSE_CATEGORIES = [
  { value: 'bad_debt',    label: '💀 Bad Debt / Write-off',  desc: 'Customer absconded / non-recoverable' },
  { value: 'damage',      label: '💥 Damage / Accident',      desc: 'Customer-caused damage not recovered' },
  { value: 'tyre',        label: '🔄 Tyre / Tube',            desc: '' },
  { value: 'maintenance', label: '🔧 Maintenance',             desc: '' },
  { value: 'repair',      label: '🛠️ Repair',                  desc: '' },
  { value: 'insurance',   label: '📋 Insurance',               desc: '' },
  { value: 'fuel',        label: '⛽ Fuel',                    desc: '' },
  { value: 'cleaning',    label: '🧽 Cleaning',                desc: '' },
  { value: 'parts',       label: '⚙️ Parts',                   desc: '' },
  { value: 'other',       label: '📝 Other',                   desc: '' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rupee(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function customerInfo(b: Booking) {
  const name = b.user
    ? [b.user.first_name, b.user.last_name].filter(Boolean).join(' ') || 'Unknown'
    : b.customer_name?.trim() || 'Walk-in';
  const phone = b.user?.phone ?? b.customer_phone ?? null;
  return { name, phone };
}

function bookingSource(b: Booking): { label: string; color: string } {
  if (b.source === 'manual') return { label: 'Manual', color: 'bg-purple-100 text-purple-700' };
  if (b.razorpay_payment_id) return { label: 'Online', color: 'bg-blue-100 text-blue-700' };
  return { label: 'At Pickup', color: 'bg-amber-100 text-amber-700' };
}

function timeStatus(end_ts: string, status: string): {
  label: string; sublabel: string; color: string; overdue: boolean; urgent: boolean;
} {
  const now = new Date();
  const end = new Date(end_ts);
  const diffMs = end.getTime() - now.getTime();
  const diffHrs = diffMs / 3_600_000;

  if (status === 'confirmed') {
    const startDiff = diffHrs; // actually this is end, but for confirmed we care about start
    return { label: 'Awaiting pickup', sublabel: fmtDate(end_ts), color: 'text-blue-600', overdue: false, urgent: false };
  }
  if (diffHrs < 0) {
    const hrs = Math.abs(diffHrs);
    return {
      label: `${hrs < 1 ? `${Math.round(hrs * 60)}m` : `${hrs.toFixed(1)}h`} OVERDUE`,
      sublabel: `Was due ${fmtDate(end_ts)}`,
      color: 'text-red-600', overdue: true, urgent: true,
    };
  }
  if (diffHrs < 1) return { label: `${Math.round(diffHrs * 60)}m left`, sublabel: fmtDate(end_ts), color: 'text-amber-600', overdue: false, urgent: true };
  if (diffHrs < 3) return { label: `${diffHrs.toFixed(1)}h left`, sublabel: fmtDate(end_ts), color: 'text-amber-600', overdue: false, urgent: true };
  if (diffHrs < 24) return { label: `${diffHrs.toFixed(1)}h left`, sublabel: fmtDate(end_ts), color: 'text-green-600', overdue: false, urgent: false };
  const days = Math.floor(diffHrs / 24);
  const hrs = Math.round(diffHrs % 24);
  return { label: `${days}d ${hrs}h left`, sublabel: fmtDate(end_ts), color: 'text-green-600', overdue: false, urgent: false };
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

const TIER_LABELS: Record<string, string> = {
  '12hr': '12 hrs', '24hr': '1 day', '7day': '7 days', '15day': '15 days', '30day': '30 days',
};

const STATUS_CHIP: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: 'Available',  cls: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  confirmed: { label: 'Booked',     cls: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  ongoing:   { label: 'On Ride',    cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  overdue:   { label: 'OVERDUE',    cls: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  frozen:    { label: 'Frozen',     cls: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400' },
};

// ─── Main component ──────────────────────────────────────────────────────────

export function FleetDashboard({
  fleetBikes, activeBookings, allBikes,
}: {
  fleetBikes: FleetBike[];
  activeBookings: Booking[];
  allBikes: BikeOption[];
}) {
  const [bookingFilter, setBookingFilter] = useState<'all' | 'ongoing' | 'confirmed' | 'overdue'>('all');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    bike_id: '', category: 'bad_debt', description: '', amount: '',
    expense_date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);

  const now = new Date();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = fleetBikes.length;
    const available = fleetBikes.filter(b => b.fleetStatus === 'available').length;
    const ongoing   = fleetBikes.filter(b => b.fleetStatus === 'ongoing').length;
    const confirmed = fleetBikes.filter(b => b.fleetStatus === 'confirmed').length;
    const overdue   = fleetBikes.filter(b => b.fleetStatus === 'overdue').length;
    const frozen    = fleetBikes.filter(b => b.fleetStatus === 'frozen').length;

    // Revenue from active bookings (rental portion only, not refundable deposit)
    const expectedIncome = activeBookings.reduce((s, b) => s + (b.total_amount - b.security_deposit), 0);
    const collectedIncome = activeBookings
      .filter(b => b.payment_status === 'paid')
      .reduce((s, b) => s + (b.total_amount - b.security_deposit), 0);
    const pendingIncome = expectedIncome - collectedIncome;

    const zodito = fleetBikes.filter(b => b.owner_type === 'platform').length;
    const vendor  = fleetBikes.filter(b => b.owner_type === 'vendor').length;

    return { total, available, ongoing, confirmed, overdue, frozen, expectedIncome, collectedIncome, pendingIncome, zodito, vendor };
  }, [fleetBikes, activeBookings]);

  // ── Active bookings filtered + sorted ────────────────────────────────────
  const filteredBookings = useMemo(() => {
    return activeBookings.filter(b => {
      if (bookingFilter === 'ongoing') return b.status === 'ongoing' && new Date(b.end_ts) >= now;
      if (bookingFilter === 'confirmed') return b.status === 'confirmed';
      if (bookingFilter === 'overdue') return b.status === 'ongoing' && new Date(b.end_ts) < now;
      return true;
    });
  }, [activeBookings, bookingFilter]);

  const overdueCount = activeBookings.filter(b => b.status === 'ongoing' && new Date(b.end_ts) < now).length;

  // ── Expense save ──────────────────────────────────────────────────────────
  async function saveExpense() {
    if (!expenseForm.bike_id || !expenseForm.description.trim() || !expenseForm.amount) return;
    setExpenseSaving(true);
    setExpenseError(null);
    setExpenseSuccess(null);
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bike_id: expenseForm.bike_id,
          category: expenseForm.category,
          description: expenseForm.description.trim(),
          amount: parseFloat(expenseForm.amount),
          expense_date: expenseForm.expense_date,
          notes: expenseForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setExpenseSuccess('Logged successfully');
      setExpenseForm(f => ({ ...f, bike_id: '', description: '', amount: '', notes: '' }));
    } catch (e: any) {
      setExpenseError(e.message);
    } finally {
      setExpenseSaving(false);
    }
  }

  const upd = (k: string, v: string) => setExpenseForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl">Fleet Command Center</h1>
          <p className="text-muted text-sm mt-0.5">Live view of all bikes, active bookings and revenue</p>
        </div>
        <button
          onClick={() => { setShowExpenseModal(true); setExpenseError(null); setExpenseSuccess(null); }}
          className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 font-semibold text-sm rounded-xl hover:bg-red-100 transition-colors"
        >
          + Log Expense / Write-off
        </button>
      </div>

      {/* ── Overdue alert banner ── */}
      {overdueCount > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 flex items-center gap-3">
          <div className="text-2xl">🚨</div>
          <div>
            <div className="font-bold text-red-700">
              {overdueCount} bike{overdueCount > 1 ? 's' : ''} OVERDUE — return time has passed
            </div>
            <div className="text-sm text-red-600 mt-0.5">
              Contact customers immediately. Extra charges apply per hour.
            </div>
          </div>
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Total Fleet" value={stats.total} sub={`${stats.zodito} Zodito · ${stats.vendor} Partner`} />
        <Stat label="Available" value={stats.available} color="green" />
        <Stat label="Confirmed" value={stats.confirmed} color="blue" sub="awaiting pickup" />
        <Stat label="On Ride" value={stats.ongoing} color="orange" />
        <Stat label="Overdue" value={stats.overdue} color="red" />
        <Stat label="Frozen" value={stats.frozen} color="gray" />
        <Stat label="Expected Revenue" value={rupee(stats.expectedIncome)} color="green" sub="active bookings" wide />
        <Stat label="Pending Collection" value={rupee(stats.pendingIncome)} color="amber" sub="at-pickup unpaid" wide />
      </div>

      {/* ── Fleet board ── */}
      <div>
        <h2 className="font-display font-semibold text-lg mb-3">Fleet Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {fleetBikes.map(bike => {
            const chip = STATUS_CHIP[bike.fleetStatus];
            const { name: custName, phone: custPhone } = bike.booking ? customerInfo(bike.booking as any) : { name: null, phone: null };
            return (
              <div
                key={bike.id}
                className={`card p-3 text-center border-2 ${
                  bike.fleetStatus === 'overdue' ? 'border-red-400 bg-red-50/50' :
                  bike.fleetStatus === 'ongoing' ? 'border-orange-200' :
                  bike.fleetStatus === 'confirmed' ? 'border-blue-200' :
                  'border-transparent'
                }`}
              >
                <div className="w-full h-16 rounded-lg overflow-hidden bg-primary/5 flex items-center justify-center mb-2">
                  {bike.image_url
                    ? <img src={bike.image_url} alt={bike.model?.display_name} className="w-full h-full object-cover" />
                    : <span className="text-3xl">{bike.emoji}</span>}
                </div>
                <div className="font-semibold text-xs leading-tight line-clamp-1">{bike.model?.display_name}</div>
                {bike.registration_number && (
                  <div className="text-[10px] text-muted">{bike.registration_number}</div>
                )}
                <div className="mt-1.5 flex items-center justify-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                </div>
                {custName && (
                  <div className="mt-1 text-[10px] text-muted leading-tight">
                    <div className="font-medium truncate">{custName}</div>
                    {custPhone && <div>{custPhone}</div>}
                  </div>
                )}
                {bike.booking && (
                  <div className={`mt-1 text-[10px] font-semibold ${
                    bike.fleetStatus === 'overdue' ? 'text-red-600' :
                    bike.fleetStatus === 'ongoing' ? 'text-orange-600' : 'text-blue-600'
                  }`}>
                    {timeStatus(bike.booking.end_ts, bike.booking.status).label}
                  </div>
                )}
                {bike.fleetStatus === 'frozen' && bike.freeze_reason && (
                  <div className="mt-1 text-[10px] text-muted truncate">{bike.freeze_reason}</div>
                )}
                <div className="mt-1 text-[10px] text-muted/60">
                  {bike.owner_type === 'vendor' ? '🤝 Partner' : '🏢 Zodito'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active bookings table ── */}
      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h2 className="font-display font-semibold text-lg">Active Bookings</h2>
          <div className="flex gap-1 flex-wrap">
            {(['all', 'ongoing', 'confirmed', 'overdue'] as const).map(f => (
              <button
                key={f}
                onClick={() => setBookingFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  bookingFilter === f
                    ? f === 'overdue' ? 'bg-red-500 text-white' : 'bg-accent text-white'
                    : 'bg-border/40 text-muted hover:text-primary'
                }`}
              >
                {f === 'all' ? `All (${activeBookings.length})` :
                 f === 'ongoing' ? `On Ride (${activeBookings.filter(b => b.status === 'ongoing' && new Date(b.end_ts) >= now).length})` :
                 f === 'confirmed' ? `Confirmed (${activeBookings.filter(b => b.status === 'confirmed').length})` :
                 `Overdue (${overdueCount})`}
              </button>
            ))}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="card p-10 text-center text-muted text-sm">
            No bookings in this filter.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    {['Bike', 'Customer', 'Source', 'Package', 'Start → Return', 'Time', 'Amount', 'Payment'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map(b => {
                    const ts = timeStatus(b.end_ts, b.status);
                    const src = bookingSource(b);
                    const cust = customerInfo(b);
                    const rentalIncome = b.total_amount - b.security_deposit;
                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-border last:border-0 transition-colors ${
                          ts.overdue ? 'bg-red-50 hover:bg-red-100/70' :
                          ts.urgent ? 'bg-amber-50 hover:bg-amber-100/50' :
                          'hover:bg-bg/50'
                        }`}
                      >
                        {/* Bike */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-xs whitespace-nowrap">
                            {b.bike?.emoji} {b.bike?.model?.display_name ?? '—'}
                          </div>
                          {b.bike?.registration_number && (
                            <div className="text-[10px] text-muted">{b.bike.registration_number}</div>
                          )}
                          <div className="text-[10px] text-muted">#{b.booking_number}</div>
                        </td>
                        {/* Customer */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{cust.name}</div>
                          {cust.phone && (
                            <a href={`tel:${cust.phone}`} className="text-[10px] text-accent hover:underline">{cust.phone}</a>
                          )}
                        </td>
                        {/* Source */}
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${src.color}`}>
                            {src.label}
                          </span>
                        </td>
                        {/* Package */}
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {TIER_LABELS[b.package_tier] ?? b.package_tier}
                        </td>
                        {/* Start → Return */}
                        <td className="px-4 py-3 text-[11px] text-muted whitespace-nowrap">
                          <div>{fmtDate(b.start_ts)}</div>
                          <div className="font-medium text-primary">→ {fmtDate(b.end_ts)}</div>
                        </td>
                        {/* Time */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className={`text-xs font-bold ${ts.color}`}>{ts.label}</div>
                          {ts.overdue && (
                            <div className="text-[10px] text-red-500">Call customer now</div>
                          )}
                        </td>
                        {/* Amount */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-xs">{rupee(rentalIncome)}</div>
                          <div className="text-[10px] text-muted">+{rupee(b.security_deposit)} deposit</div>
                        </td>
                        {/* Payment */}
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            b.payment_status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {b.payment_status === 'paid' ? '✓ Paid' : '⏳ Collect'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Revenue footer */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-bg/80">
                    <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-right text-muted">
                      Expected rental income ({filteredBookings.length} bookings)
                    </td>
                    <td className="px-4 py-3 font-bold text-sm text-green-600">
                      {rupee(filteredBookings.reduce((s, b) => s + b.total_amount - b.security_deposit, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Expense / Write-off modal ── */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-display font-semibold text-lg">Log Expense / Write-off</h3>
                <p className="text-xs text-muted mt-0.5">Bad debts, damage, repairs, maintenance</p>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Category *</label>
                <select value={expenseForm.category} onChange={e => upd('category', e.target.value)} className="input-field w-full">
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}{c.desc ? ` — ${c.desc}` : ''}</option>
                  ))}
                </select>
                {(expenseForm.category === 'bad_debt' || expenseForm.category === 'damage') && (
                  <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded-lg">
                    ⚠️ This will be logged as a financial write-off. Include the booking number in the notes.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Bike *</label>
                <select value={expenseForm.bike_id} onChange={e => upd('bike_id', e.target.value)} className="input-field w-full">
                  <option value="">Select bike…</option>
                  {allBikes.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.emoji} {b.model?.display_name ?? 'Bike'}{b.registration_number ? ` (${b.registration_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Amount (₹) *</label>
                  <input
                    type="number" min="0" step="1"
                    value={expenseForm.amount}
                    onChange={e => upd('amount', e.target.value)}
                    className="input-field w-full"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-1">Date *</label>
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={e => upd('expense_date', e.target.value)}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Description *</label>
                <input
                  value={expenseForm.description}
                  onChange={e => upd('description', e.target.value)}
                  className="input-field w-full"
                  placeholder="e.g. Customer absconded — booking #Z1234"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Notes</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={e => upd('notes', e.target.value)}
                  className="input-field w-full h-16 resize-none"
                  placeholder="Customer phone, booking reference, incident details…"
                />
              </div>

              {expenseError && <p className="text-xs text-danger bg-danger/10 p-2.5 rounded-lg">{expenseError}</p>}
              {expenseSuccess && <p className="text-xs text-success bg-success/10 p-2.5 rounded-lg">✓ {expenseSuccess}</p>}
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowExpenseModal(false)} className="border border-border rounded-lg px-4 py-2 text-sm hover:bg-border/30">Cancel</button>
              <button
                onClick={saveExpense}
                disabled={!expenseForm.bike_id || !expenseForm.description.trim() || !expenseForm.amount || expenseSaving}
                className="btn-accent px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {expenseSaving ? 'Saving…' : 'Log Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({
  label, value, color, sub, wide,
}: {
  label: string; value: string | number; color?: string; sub?: string; wide?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: 'text-green-600', red: 'text-red-600', orange: 'text-orange-500',
    blue: 'text-blue-600', amber: 'text-amber-600', gray: 'text-gray-400',
  };
  return (
    <div className={`card p-3 ${wide ? 'col-span-2 md:col-span-2' : ''}`}>
      <p className="text-[10px] font-bold text-muted uppercase tracking-wide leading-tight">{label}</p>
      <p className={`font-display font-bold text-lg mt-0.5 ${color ? colorMap[color] : 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
