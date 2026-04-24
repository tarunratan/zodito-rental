import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore, MOCK_BIKES } from '@/lib/mock';
import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

async function fetchVendorData(userId: string) {
  if (isMockMode()) {
    // Mock: pretend the user owns bikes 7 and 8
    const myBikes = MOCK_BIKES.filter(b => b.owner_type === 'vendor');
    const myBookings = mockBookingsStore.filter(b =>
      myBikes.some(bike => bike.id === b.bike_id)
    );
    return {
      vendor: {
        id: 'v-mock',
        business_name: 'Mock Vendor Store',
        status: 'approved',
        commission_pct: 20,
        pickup_area: 'Kukatpally',
      },
      bikes: myBikes,
      bookings: myBookings.map(b => ({
        ...b,
        bike: myBikes.find(k => k.id === b.bike_id),
        total_amount: 1500,
        vendor_payout: 1040,
        platform_commission: 460,
      })),
    };
  }

  const supabase = createSupabaseAdmin();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!vendor) return null;

  const { data: bikes } = await supabase
    .from('bikes')
    .select(`
      id, emoji, listing_status, is_active, registration_number, color, year,
      model:bike_models!inner(display_name, cc)
    `)
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false });

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_number, start_ts, end_ts, package_tier, status, payment_status,
      total_amount, platform_commission, vendor_payout, base_price,
      bike:bikes!inner(id, emoji, model:bike_models!inner(display_name)),
      user:users!inner(first_name, last_name, phone, email)
    `)
    .in('bike_id', (bikes ?? []).map(b => b.id))
    .order('start_ts', { ascending: false });

  return { vendor, bikes: bikes ?? [], bookings: bookings ?? [] };
}

export default async function VendorDashboard() {
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p>Please sign in.</p>
      </div>
    );
  }

  const data = await fetchVendorData(user.id);

  // If no vendor record, redirect to signup
  if (!data) redirect('/vendor/signup');
  if (data.vendor.status !== 'approved') redirect('/vendor/signup');

  const { vendor, bikes, bookings } = data;

  // Earnings summary
  const confirmedBookings = bookings.filter((b: any) => ['confirmed', 'ongoing', 'completed'].includes(b.status));
  const totalGrossRevenue = confirmedBookings.reduce((sum: number, b: any) => sum + Number(b.total_amount ?? 0), 0);
  const totalVendorPayout = confirmedBookings.reduce((sum: number, b: any) => sum + Number(b.vendor_payout ?? 0), 0);
  const totalCommission = confirmedBookings.reduce((sum: number, b: any) => sum + Number(b.platform_commission ?? 0), 0);

  // This month
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const thisMonthBookings = confirmedBookings.filter((b: any) => new Date(b.start_ts) >= startOfMonth);
  const thisMonthPayout = thisMonthBookings.reduce((sum: number, b: any) => sum + Number(b.vendor_payout ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl tracking-tight">{vendor.business_name}</h1>
          <p className="text-muted text-sm mt-1">📍 {vendor.pickup_area} · {bikes.length} bikes listed</p>
        </div>
        <Link href="/vendor/bikes/new" className="btn-accent text-sm">+ List a bike</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="This Month" value={formatINR(thisMonthPayout)} sub={`${thisMonthBookings.length} rides`} accent />
        <Kpi label="Lifetime Earnings" value={formatINR(totalVendorPayout)} sub={`${confirmedBookings.length} rides total`} />
        <Kpi label="Active Listings" value={bikes.filter((b: any) => b.is_active && b.listing_status === 'approved').length.toString()} sub={`${bikes.length} total`} />
        <Kpi label="Commission Rate" value={`${vendor.commission_pct}%`} sub="Platform fee" />
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

      {/* Bookings */}
      <section>
        <h2 className="font-display font-semibold text-lg mb-3">Recent bookings</h2>
        {bookings.length === 0 ? (
          <div className="card p-8 text-center text-muted text-sm">
            No bookings yet. Once customers book your bikes, they&apos;ll appear here.
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
                  {bookings.map((b: any) => (
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
                              <a href={`tel:${b.user.phone}`} className="text-[11px] text-accent">
                                {b.user.phone}
                              </a>
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
                        <StatusPill status={b.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Summary */}
      {confirmedBookings.length > 0 && (
        <div className="mt-6 p-4 bg-accent/5 border border-accent/20 rounded-card text-sm grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Gross revenue</div>
            <div className="font-display font-bold text-lg">{formatINR(totalGrossRevenue)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Platform fee ({vendor.commission_pct}%)</div>
            <div className="font-display font-bold text-lg text-muted">−{formatINR(totalCommission)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Net to you</div>
            <div className="font-display font-bold text-lg text-success">{formatINR(totalVendorPayout)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`font-display font-bold text-2xl mt-0.5 ${accent ? 'text-accent' : ''}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function VendorBikeCard({ bike }: { bike: any }) {
  const status = bike.listing_status;
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-border', text: 'text-muted', label: 'Draft' },
    pending_approval: { bg: 'bg-warning/15', text: 'text-warning', label: 'Pending Review' },
    approved: { bg: 'bg-success/15', text: 'text-success', label: 'Live' },
    rejected: { bg: 'bg-danger/15', text: 'text-danger', label: 'Rejected' },
    inactive: { bg: 'bg-muted/15', text: 'text-muted', label: 'Inactive' },
  };
  const s = styles[status] ?? styles.draft;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="text-4xl">{bike.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm line-clamp-1">{bike.model.display_name}</div>
          <div className="text-xs text-muted mt-0.5">{bike.color} · {bike.year}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
              {s.label}
            </span>
            {!bike.is_active && status === 'approved' && (
              <span className="text-[10px] text-muted">· paused</span>
            )}
          </div>
          {bike.registration_number && (
            <div className="text-[10px] text-muted mt-2">{bike.registration_number}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_payment: 'bg-warning/15 text-warning',
    confirmed: 'bg-success/15 text-success',
    ongoing: 'bg-info/15 text-info',
    completed: 'bg-border text-muted',
    cancelled: 'bg-danger/10 text-danger',
    payment_failed: 'bg-danger/10 text-danger',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${styles[status] ?? 'bg-border'}`}>
      {status.replace('_', ' ')}
    </span>
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
