import Link from 'next/link';
import { formatINR, formatDateTime } from '@/lib/utils';
import { TIER_LABELS } from '@/lib/pricing';
import type { PackageTier } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { CancelBookingButton } from './CancelBookingButton';

type Booking = any;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending_payment: { bg: 'bg-warning/15', text: 'text-warning', label: 'Awaiting Payment' },
  confirmed: { bg: 'bg-success/15', text: 'text-success', label: 'Confirmed' },
  ongoing: { bg: 'bg-info/15', text: 'text-info', label: 'Ongoing' },
  completed: { bg: 'bg-border', text: 'text-muted', label: 'Completed' },
  cancelled: { bg: 'bg-danger/10', text: 'text-danger', label: 'Cancelled' },
  payment_failed: { bg: 'bg-danger/10', text: 'text-danger', label: 'Payment Failed' },
};

export function BookingCard({ booking }: { booking: Booking }) {
  const bike = booking.bike;
  if (!bike) return null;
  const style = STATUS_STYLES[booking.status] ?? STATUS_STYLES.completed;
  const isVendor = bike.owner_type === 'vendor';
  const canCancel = booking.status === 'confirmed' || booking.status === 'pending_payment';
  const paid = booking.status === 'confirmed' || booking.status === 'ongoing' || booking.status === 'completed';

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-primary/5 flex items-center justify-center text-3xl md:text-4xl shrink-0">
          {bike.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-display font-semibold text-base md:text-lg">
                {bike.model.display_name}
              </div>
              <div className="text-xs text-muted mt-0.5">
                #{booking.booking_number} · {TIER_LABELS[booking.package_tier as PackageTier]}
              </div>
            </div>
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md',
              style.bg, style.text
            )}>
              {style.label}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <Info label="Pickup" value={formatDateTime(booking.start_ts)} />
            <Info label="Drop-off" value={formatDateTime(booking.end_ts)} />
            <Info label="KM limit" value={`${booking.km_limit} km`} />
            <Info label={paid ? 'Paid' : 'Total'} value={formatINR(booking.total_amount ?? 0)} emphasis />
          </div>

          {/* Vendor-specific: show pickup details only after payment */}
          {isVendor && paid && bike.vendor && (
            <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg text-xs">
              <div className="font-semibold text-primary mb-1">
                📍 {bike.vendor.business_name}
              </div>
              <div className="text-muted">
                {bike.vendor.pickup_address ?? bike.vendor.pickup_area}
              </div>
              {bike.vendor.contact_phone && (
                <a
                  href={`tel:${bike.vendor.contact_phone}`}
                  className="inline-block mt-1.5 text-accent font-semibold"
                >
                  📞 {bike.vendor.contact_phone}
                </a>
              )}
            </div>
          )}

          {isVendor && !paid && (
            <div className="mt-3 text-[11px] text-muted italic">
              Pickup address shown once payment is confirmed
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <Link
              href={`/my-bookings/${booking.id}`}
              className="text-xs font-medium px-3 py-1.5 border border-border rounded-md hover:border-primary transition-colors"
            >
              View details
            </Link>
            {canCancel && <CancelBookingButton bookingId={booking.id} />}
            {booking.status === 'pending_payment' && (
              <span className="text-[10px] text-warning self-center">
                ⏱ Complete payment within 10 min
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={cn('mt-0.5', emphasis ? 'font-display font-bold text-base text-accent' : 'font-semibold text-sm')}>
        {value}
      </div>
    </div>
  );
}
