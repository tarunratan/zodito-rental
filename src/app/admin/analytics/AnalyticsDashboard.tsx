'use client';

type Props = {
  data: {
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
  };
};

function rupee(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function pct(a: number, b: number) {
  if (!b) return '0%';
  return `${((a / b) * 100).toFixed(1)}%`;
}

export function AnalyticsDashboard({ data }: Props) {
  const { revenue, bookings, monthlyRevenue, topBikes, fleet, kyc, vendors, expenses, pnl, bikePnl } = data;
  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map(m => m.revenue), 1);
  const totalBookingsByStatus = Object.values(bookings.byStatus).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: rupee(revenue.total), sub: 'all time' },
          { label: 'This Month', value: rupee(revenue.thisMonth), sub: revenue.lastMonth ? `${((revenue.thisMonth - revenue.lastMonth) / revenue.lastMonth * 100).toFixed(1)}% vs last` : 'vs last month' },
          { label: 'Last Month', value: rupee(revenue.lastMonth), sub: 'previous period' },
          { label: 'Net Profit', value: rupee(pnl.net), sub: `after ₹${(pnl.expenses / 1000).toFixed(1)}k expenses`, highlight: true },
        ].map(k => (
          <div key={k.label} className={`card p-4 ${k.highlight ? 'border-accent/30 bg-accent/5' : ''}`}>
            <p className="text-xs font-semibold text-muted uppercase mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.highlight ? 'text-accent' : ''}`}>{k.value}</p>
            <p className="text-xs text-muted mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Bookings', value: bookings.total },
          { label: 'Active Fleet', value: fleet.active },
          { label: 'Total Fleet', value: fleet.total },
          { label: 'Frozen', value: fleet.frozen, warn: fleet.frozen > 0 },
          { label: 'KYC Pending', value: kyc.pending, warn: kyc.pending > 0 },
          { label: 'Vendor Pending', value: vendors.pending, warn: vendors.pending > 0 },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-2xl font-bold ${s.warn ? 'text-orange-500' : ''}`}>{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="card p-5">
        <h3 className="font-semibold mb-4">Monthly Revenue (6 months)</h3>
        <div className="flex items-end gap-2 h-40">
          {monthlyRevenue.map(m => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-xs text-muted">{rupee(m.revenue)}</div>
              <div
                className="w-full bg-accent/80 rounded-t-sm transition-all"
                style={{ height: `${(m.revenue / maxMonthlyRevenue) * 100}%`, minHeight: m.revenue > 0 ? '4px' : '0' }}
              />
              <div className="text-xs text-muted whitespace-nowrap">{m.month}</div>
              <div className="text-[10px] text-muted">{m.bookings} rides</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Booking pipeline */}
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Booking Status Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(bookings.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="capitalize">{status.replace('_', ' ')}</span>
                  <span className="font-semibold">{count}</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: pct(count, totalBookingsByStatus) }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top bikes */}
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Top Bikes by Revenue</h3>
          <div className="space-y-3">
            {topBikes.map((bike, i) => (
              <div key={bike.id} className="flex items-center gap-3">
                <span className="text-lg font-bold text-muted w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{bike.name}</div>
                  <div className="text-xs text-muted">{bike.rides} rides</div>
                </div>
                <div className="text-sm font-semibold text-accent">{rupee(bike.revenue)}</div>
              </div>
            ))}
            {topBikes.length === 0 && <p className="text-sm text-muted">No revenue data yet.</p>}
          </div>
        </div>
      </div>

      {/* Expenses breakdown */}
      {expenses.total > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Expense Breakdown</h3>
            <span className="text-sm font-semibold text-red-500">{rupee(expenses.total)} total</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(expenses.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize">{cat}</span>
                  <span>{rupee(amount)} ({pct(amount, expenses.total)})</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: pct(amount, expenses.total) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-bike P&L */}
      {bikePnl.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold">Per-Bike P&L</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase">Bike</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase">Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase">Expenses</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase">Net</th>
                </tr>
              </thead>
              <tbody>
                {bikePnl.map(b => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3 text-right text-green-600">{rupee(b.revenue)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{rupee(b.expenses)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${b.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{rupee(b.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-bg/60">
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">{rupee(pnl.revenue)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-500">{rupee(pnl.expenses)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${pnl.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{rupee(pnl.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
