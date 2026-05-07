'use client';

import Link from 'next/link';

export interface ConfirmedBooking {
  id: string;
  number: string;
  pendingAmount?: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function ConfirmedBookingPanel({
  booking,
  totalAmount,
  securityDeposit,
  partialAdvance,
  partialPending,
}: {
  booking: ConfirmedBooking;
  totalAmount: number;
  securityDeposit: number;
  partialAdvance: number;
  partialPending: number;
}) {
  const isPending = (booking.pendingAmount ?? 0) > 0;
  const paidNow   = booking.pendingAmount !== undefined
    ? totalAmount - booking.pendingAmount
    : partialAdvance;
  const dueLater  = booking.pendingAmount ?? partialPending;

  return (
    <div className="mt-4 rounded-2xl border-2 border-green-400 bg-green-50 overflow-hidden">
      <div className="bg-green-400 px-5 py-3 flex items-center gap-2">
        <span className="text-white text-xl">✓</span>
        <span className="text-white font-bold text-base">Booking Confirmed!</span>
      </div>
      <div className="p-5 space-y-3">
        <Row label="Booking Number" valueClass="text-green-900 font-bold font-mono">{booking.number}</Row>

        {isPending ? (
          <>
            <Row label="Paid now (advance)">{inr(paidNow)}</Row>
            <Row label="Due at pickup" labelClass="text-orange-600 font-semibold" valueClass="text-orange-700 font-bold">
              {inr(dueLater)}
            </Row>
            {securityDeposit > 0 && (
              <Row
                label={<>Security deposit <span className="text-[10px]">(refunded after drop-off)</span></>}
              >
                {inr(securityDeposit)}
              </Row>
            )}
            <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
              Bring cash or UPI to pay the remaining amount at pickup.
            </p>
          </>
        ) : (
          <>
            <Row label="Payment">Cash / UPI at pickup</Row>
            <Row label="Rental amount">{inr(totalAmount)}</Row>
            {securityDeposit > 0 && (
              <Row
                label={<>Security deposit <span className="text-[10px] text-green-600">(refunded after drop-off)</span></>}
              >
                {inr(securityDeposit)}
              </Row>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-bold text-green-700">Total at pickup</span>
              <span className="font-bold text-green-900">{inr(totalAmount + securityDeposit)}</span>
            </div>
          </>
        )}

        <Link
          href={`/my-bookings?success=${booking.id}`}
          className="block w-full text-center py-2.5 mt-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition-colors"
        >
          View My Bookings →
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  labelClass = 'text-green-700',
  valueClass = 'text-green-900 font-semibold',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-green-200">
      <span className={`text-sm ${labelClass}`}>{label}</span>
      <span className={valueClass}>{children}</span>
    </div>
  );
}
