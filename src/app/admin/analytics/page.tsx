import { createSupabaseAdmin } from '@/lib/supabase/server';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { isMockMode } from '@/lib/mock';

export const dynamic = 'force-dynamic';

type BRow = { id: string; status: string; payment_status: string; total_amount: string; platform_commission: string; created_at: string; bike_id: string };
type BikeRow = { id: string; listing_status: string; is_active: boolean; frozen_until: string | null; model: { display_name: string } | null };
type ERow = { id: string; bike_id: string; category: string; amount: string };

async function fetchAnalytics() {
  if (isMockMode()) {
    return {
      revenue: { total: 125400, thisMonth: 32000, lastMonth: 28500, commission: 95000 },
      bookings: { total: 48, byStatus: { confirmed: 5, ongoing: 3, completed: 32, cancelled: 6, pending_payment: 2 } },
      monthlyRevenue: [
        { month: 'Nov 24', revenue: 18200, bookings: 7 },
        { month: 'Dec 24', revenue: 22400, bookings: 9 },
        { month: 'Jan 25', revenue: 19800, bookings: 8 },
        { month: 'Feb 25', revenue: 24600, bookings: 10 },
        { month: 'Mar 25', revenue: 28500, bookings: 11 },
        { month: 'Apr 25', revenue: 32000, bookings: 13 },
      ],
      topBikes: [
        { id: '1', name: 'Royal Enfield 350', revenue: 34500, rides: 14 },
        { id: '2', name: 'Honda Activa 6G', revenue: 22300, rides: 18 },
        { id: '3', name: 'Yamaha R15 v4', revenue: 18900, rides: 7 },
        { id: '4', name: 'TVS Jupiter', revenue: 14200, rides: 11 },
        { id: '5', name: 'KTM Duke 200', revenue: 12800, rides: 5 },
      ],
      fleet: { total: 12, active: 10, frozen: 1 },
      kyc: { pending: 4, approved: 38 },
      vendors: { pending: 2, approved: 5 },
      expenses: { total: 18500, byCategory: { tyre: 6200, maintenance: 5800, repair: 3100, fuel: 2200, other: 1200 } },
      pnl: { revenue: 125400, expenses: 18500, net: 106900 },
      bikePnl: [{ id: '1', name: 'Royal Enfield 350', revenue: 34500, expenses: 4200, net: 30300 }],
    };
  }

  const supabase = createSupabaseAdmin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [allBookings, allBikes, usersRes, vendorsRes, expensesRes] = await Promise.all([
    supabase.from('bookings').select('id, status, payment_status, total_amount, platform_commission, created_at, bike_id'),
    supabase.from('bikes').select('id, listing_status, is_active, frozen_until, model:bike_models(display_name)'),
    supabase.from('users').select('id, kyc_status'),
    supabase.from('vendors').select('id, status'),
    supabase.from('bike_expenses').select('id, bike_id, category, amount'),
  ]);

  const bookings = (allBookings.data ?? []) as BRow[];
  const bikes = (allBikes.data ?? []) as BikeRow[];
  const users = (usersRes.data ?? []) as { id: string; kyc_status: string }[];
  const vendors = (vendorsRes.data ?? []) as { id: string; status: string }[];
  const expenseRows = (expensesRes.data ?? []) as ERow[];

  const paidBookings = bookings.filter(b => b.payment_status === 'paid');
  const totalRevenue = paidBookings.reduce((s, b) => s + Number(b.total_amount), 0);
  const thisMonthRevenue = paidBookings.filter(b => b.created_at >= monthStart).reduce((s, b) => s + Number(b.total_amount), 0);
  const lastMonthRevenue = paidBookings.filter(b => b.created_at >= lastMonthStart && b.created_at < monthStart).reduce((s, b) => s + Number(b.total_amount), 0);
  const totalCommission = paidBookings.reduce((s, b) => s + Number(b.platform_commission), 0);

  const byStatus = bookings.reduce((acc: Record<string, number>, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  const monthlyRevenue: { month: string; revenue: number; bookings: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
    const mb = paidBookings.filter(b => b.created_at >= start && b.created_at < end);
    monthlyRevenue.push({
      month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      revenue: mb.reduce((s, b) => s + Number(b.total_amount), 0),
      bookings: mb.length,
    });
  }

  const bikeRevMap: Record<string, { revenue: number; rides: number; name: string }> = {};
  for (const b of paidBookings) {
    const bikeInfo = bikes.find(bk => bk.id === b.bike_id);
    const name = (bikeInfo?.model as { display_name: string } | null)?.display_name ?? 'Unknown';
    if (!bikeRevMap[b.bike_id]) bikeRevMap[b.bike_id] = { revenue: 0, rides: 0, name };
    bikeRevMap[b.bike_id].revenue += Number(b.total_amount);
    bikeRevMap[b.bike_id].rides += 1;
  }
  const topBikes = Object.entries(bikeRevMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const totalExpenses = expenseRows.reduce((s, e) => s + Number(e.amount), 0);
  const expenseByCategory = expenseRows.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {});

  const bikeExpenses = expenseRows.reduce((acc: Record<string, number>, e) => {
    acc[e.bike_id] = (acc[e.bike_id] ?? 0) + Number(e.amount);
    return acc;
  }, {});
  const bikePnl = Object.entries(bikeRevMap)
    .map(([id, v]) => ({ id, name: v.name, revenue: v.revenue, expenses: bikeExpenses[id] ?? 0, net: v.revenue - (bikeExpenses[id] ?? 0) }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 8);

  return {
    revenue: { total: totalRevenue, thisMonth: thisMonthRevenue, lastMonth: lastMonthRevenue, commission: totalCommission },
    bookings: { total: bookings.length, byStatus },
    monthlyRevenue,
    topBikes,
    fleet: {
      total: bikes.length,
      active: bikes.filter(b => b.is_active && b.listing_status === 'approved').length,
      frozen: bikes.filter(b => b.frozen_until != null && new Date(b.frozen_until) > now).length,
    },
    kyc: { pending: users.filter(u => u.kyc_status === 'pending').length, approved: users.filter(u => u.kyc_status === 'approved').length },
    vendors: { pending: vendors.filter(v => v.status === 'pending').length, approved: vendors.filter(v => v.status === 'approved').length },
    expenses: { total: totalExpenses, byCategory: expenseByCategory },
    pnl: { revenue: totalRevenue, expenses: totalExpenses, net: totalRevenue - totalExpenses },
    bikePnl,
  };
}

export default async function AdminAnalyticsPage() {
  const data = await fetchAnalytics();
  return <AnalyticsDashboard data={data} />;
}
