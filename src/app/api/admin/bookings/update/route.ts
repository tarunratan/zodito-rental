import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore } from '@/lib/mock';
import { sendBookingStatusUpdate } from '@/lib/email';
import { writeHandoverLog, type HandoverLogKind } from '@/lib/handover-audit';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string(),
  status: z.enum(['confirmed', 'ongoing', 'completed', 'cancelled', 'refunded']),
  reason: z.string().nullish(),
});

const STATUS_TO_LOG: Record<string, HandoverLogKind> = {
  confirmed: 'confirm',
  ongoing:   'start',
  completed: 'complete',
  cancelled: 'cancel',
  refunded:  'refund',
};

export async function POST(req: NextRequest) {
  try {
    const admin = !isMockMode() ? await requireAdmin() : null;

    const parse = schema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const { booking_id, status, reason } = parse.data;

    if (isMockMode()) {
      const idx = mockBookingsStore.findIndex(b => b.id === booking_id);
      if (idx >= 0) mockBookingsStore[idx].status = status === 'refunded' ? mockBookingsStore[idx].status : status;
      return NextResponse.json({ ok: true, mock: true });
    }

    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();

    // Gate for `start`: require the handover details to have been saved at
    // least once. The customer-facing rule the admin asked for: "Ride should
    // NOT start before successful save."
    if (status === 'ongoing') {
      const { data: b } = await supabase
        .from('bookings')
        .select('id, status, handover_saved_at, odometer_reading')
        .eq('id', booking_id)
        .maybeSingle();
      if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      if (b.status !== 'confirmed') {
        return NextResponse.json({ error: `Cannot start ride from status "${b.status}"` }, { status: 400 });
      }
      if (!b.handover_saved_at) {
        return NextResponse.json(
          { error: 'Save handover details first — odometer, helmets, and notes must be recorded before the ride starts.' },
          { status: 400 },
        );
      }
      if (b.odometer_reading == null) {
        return NextResponse.json(
          { error: 'Odometer reading at pickup is required before starting the ride.' },
          { status: 400 },
        );
      }
    }

    const updates: Record<string, unknown> = { updated_at: now };
    switch (status) {
      case 'confirmed':
        updates.status = 'confirmed';
        break;
      case 'ongoing':
        updates.status = 'ongoing';
        updates.picked_up_at = now;
        break;
      case 'completed':
        updates.status = 'completed';
        updates.returned_at = now;
        break;
      case 'cancelled':
        updates.status = 'cancelled';
        updates.cancelled_at = now;
        updates.cancelled_by = admin?.id;
        if (reason) updates.cancellation_reason = reason;
        break;
      case 'refunded':
        updates.payment_status = 'refunded';
        updates.deposit_refunded_at = now;
        if (reason) updates.notes = reason;
        break;
    }

    const { error } = await supabase.from('bookings').update(updates).eq('id', booking_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeHandoverLog(supabase, {
      booking_id,
      admin: admin as any,
      kind: STATUS_TO_LOG[status],
      payload: reason ? { reason } : null,
    });

    if (['ongoing', 'completed', 'cancelled'].includes(status)) {
      supabase
        .from('bookings')
        .select('booking_number, user:users(email, first_name)')
        .eq('id', booking_id)
        .maybeSingle()
        .then(({ data: b }: { data: any }) => {
          const email = b?.user?.email;
          if (!email) return;
          sendBookingStatusUpdate(email, b.user.first_name || 'there', b.booking_number, status).catch(() => {});
        }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
