'use client';

function rupee(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function pct(a: number, b: number) {
  if (!b) return '0%';
  return `${((a / b) * 100).toFixed(1)}%`;
}

function BarChart({ data, color = '#f97316' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-36 pt-4">
      {data.map(d => (
        <div key={d.label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <span className="text-[10px] text-muted font-medium">{d.value > 0 ? rupee(d.value) : ''}</span>
          <div className="w-full relative" style={{ height: '80px' }}>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all"
              style={{ height: `${(d.value / max) * 80}px`, backgroundColor: color, opacity: d.value ? 1 : 0.1 }}
            />
          </div>
          <span className="text-[10px] text-muted truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted w-28 shrink-0 truncate capitalize">{label.replace('_', ' ')}</span>
      <div className="flex-1 bg-border/40 rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold w-10 text-right">{value}</span>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-display font-bold" style={color ? { color } : {}}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

const EXPENSE_COLORS: Record<string, string> = {
  tyre: '#f97316', maintenance: '#2563eb', repair: '#dc2626',
  insurance: '#16a34a', fuel: '#d97706', cleaning: '#7c3aed',
  parts: '#0891b2', other: '#6b7280',
};

const STATUS_COLORS_BAR: Record<string, string> = {
  confirmed: '#2563eb', ongoing: '#f97316', completed: '#16a34a',
  cancelled: '#dc2626', pending_payment: '#d97706', payment_failed: '#6b7280',
};

interface AnalyticsData {
  revenue: { total: number; thisMonth: number; lastMonth: number; commission: number };
  bookings: { total: number; byStatus: Record<string, number> };
  monthlyRevenue: { month: string; revenue: number; bookings: number }[];
  topBikes: { id: string; name: string; revenue: number; rides: number }[];
  fleet: { total: number; active: number; frozen: number };
  kyc: { pending: number; approved: number };
  vendors: { pending: number; approved: number };
  expenses: { total: number; byCategory: Record<string, number> };
  pnl: { revenue: number; expenses: number; net: number };
  bikePnl: { id: string; name: string; revenue: number; expenses: number; net: number }[];
}

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const maxBookingStatus = Math.max(...Object.values(data.bookings.byStatus), 1);
  const maxExpense = Math.max(...Object.values(data.expenses.byCategory), 1);
  const monthGrowth = data.revenue.lastMonth
    ? (((data.revenue.thisMonth - data.revenue.lastMonth) / data.revenue.lastMonth) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-8">
      {/* Revenue KPIs */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Revenue Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Total Revenue"
            value={rupee(data.revenue.total)}
            sub={`${data.bookings.byStatus.completed ?? 0} completed rides`}
            color="#f97316"
          />
          <Kpi
            label="This Month"
            value={rupee(data.revenue.thisMonth)}
            sub={monthGrowth ? `${Number(monthGrowth) >= 0 ? '+' : ''}${monthGrowth}% vs last month` : undefined}
          />
          <Kpi
            label="Last Month"
            value={rupee(data.revenue.lastMonth)}
          />
          <Kpi
            label="Net Profit"
            value={rupee(data.pnl.net)}
            sub={`After ₹${Number(data.pnl.expenses).toLocaleString('en-IN')} expenses`}
            color={data.pnl.net >= 0 ? '#16a34a' : '#dc2626'}
          />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Bookings" value={String(data.bookings.total)} />
        <Kpi label="Fleet Size" value={String(data.fleet.total)} sub={`${data.fleet.active} active, ${data.fleet.frozen} frozen`} />
        <Kpi label="KYC Pending" value={String(data.kyc.pending)} sub={`${data.kyc.approved} approved total`} color={data.kyc.pending > 0 ? '#dc2626' : undefined} />
        <Kpi label="Vendor Pending" value={String(data.vendors.pending)} sub={`${data.vendors.approved} approved total`} color={data.vendors.pending > 0 ? '#d97706' : undefined} />
      </div>

      {/* Revenue trend + Booking pipeline */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold mb-1">Revenue — Last 6 Months</h3>
          <p className="text-xs text-muted mb-4">Confirmed paid bookings only</p>
          <BarChart data={data.monthlyRevenue.map(m => ({ label: m.month, value: m.revenue }))} />
          <div className="flex flex-wrap gap-3 mt-3">
            {data.monthlyRevenue.map(m => (
              <div key={m.month} className="text-xs text-muted">
                <span className="font-medium">{m.month}:</span> {m.bookings} bookings
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-4">Booking Pipeline</h3>
          <div className="space-y-2.5">
            {Object.entries(data.bookings.byStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <HBar
                  key={status}
                  label={status}
                  value={count}
                  max={maxBookingStatus}
                  color={STATUS_COLORS_BAR[status] ?? '#6b7280'}
                />
              ))}
          </div>
          <p className="text-xs text-muted mt-4">{data.bookings.total} total bookings across all time</p>
        </div>
      </div>

      {/* Top bikes + Expenses */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Top Bikes by Revenue</h3>
          {data.topBikes.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">No paid bookings yet</p>
          ) : (
            <div className="space-y-3">
              {data.topBikes.map((bike, i) => (
                <div key={bike.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{bike.name}</p>
                    <p className="text-xs text-muted">{bike.rides} rides</p>
                  </div>
                  <span className="font-semibold text-sm shrink-0">{rupee(bike.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Expenses by Category</h3>
            <span className="font-semibold text-danger">{rupee(data.expenses.total)}</span>
          </div>
          {Object.keys(data.expenses.byCategory).length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">No expenses recorded yet</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(data.expenses.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amt]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium">{cat}</span>
                        <span className="text-muted">{rupee(amt)} · {pct(amt, data.expenses.total)}</span>
                      </div>
                      <div className="w-full bg-border/40 rounded-full h-1.5">
                        <div
                          className="h-full rounded-full"
                          style={{ width: pct(amt, maxExpense), backgroundColor: EXPENSE_COLORS[cat] ?? '#6b7280' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-bike P&L */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Per-Bike P&L</h3>
          <div className="flex gap-4 text-sm">
            <span className="text-success font-semibold">Revenue: {rupee(data.pnl.revenue)}</span>
            <span className="text-danger font-semibold">Expenses: {rupee(data.pnl.expenses)}</span>
            <span className={`font-semibold ${data.pnl.net >= 0 ? 'text-success' : 'text-danger'}`}>Net: {rupee(data.pnl.net)}</span>
          </div>
        </div>
        {data.bikePnl.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-semibold text-muted uppercase">Bike</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted uppercase">Revenue</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted uppercase">Expenses</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted uppercase">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.bikePnl.map(b => (
                  <tr key={b.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-medium">{b.name}</td>
                    <td className="py-2.5 text-right text-success">{rupee(b.revenue)}</td>
                    <td className="py-2.5 text-right text-danger">{rupee(b.expenses)}</td>
                    <td className={`py-2.5 text-right font-semibold ${b.net >= 0 ? 'text-success' : 'text-danger'}`}>{rupee(b.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
