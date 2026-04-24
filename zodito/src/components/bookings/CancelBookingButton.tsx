'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onClick() {
    const reason = window.prompt('Why are you cancelling? (optional)');
    if (reason === null) return; // user hit cancel on prompt
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to cancel');
      } else {
        router.refresh();
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="text-xs font-medium px-3 py-1.5 border border-danger/30 text-danger rounded-md hover:bg-danger/5 transition-colors disabled:opacity-50"
    >
      {loading ? 'Cancelling…' : 'Cancel booking'}
    </button>
  );
}
