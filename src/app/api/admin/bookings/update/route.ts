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
  // Sent only when status === 'completed' — the admin's end-of-ride form.
  // Server recomputes final_km_used / excess_km_charge / late_charge from
  // these so the client can't fudge the totals.
  end_odometer_reading: z.number().int().nonnegative().nullish(),
  damage_charge: z.number().nonnegative().nullish(),
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
    const { booking_id, status, reason, end_odometer_reading, damage_charge } = parse.data;

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
      case 'completed': {
        updates.status = 'completed';
        updates.returned_at = now;

        // Pull the booking + bike + model so we can recompute penalties
        // server-side. The admin form sends the end-odometer reading; we
        // do the maths here so the client can't tamper with totals.
        const { data: b } = await supabase
          .from('bookings')
          .select(`
            id, status, odometer_reading, km_limit, end_ts,
            bike:bikes(extra_km_rate, late_penalty_hour,
              model:bike_models(excess_km_rate, late_hourly_penalty)
            )
          `)
          .eq('id', booking_id)
          .maybeSingle();
        if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        if (b.status !== 'ongoing') {
          return NextResponse.json(
            { error: `Cannot complete from status "${b.status}" — ride must be ongoing.` },
            { status: 400 },
          );
        }
        if (end_odometer_reading == null) {
          return NextResponse.json(
            { error: 'End odometer reading is required to complete the ride.' },
            { status: 400 },
          );
        }
        if (b.odometer_reading == null) {
          return NextResponse.json(
            { error: 'Pickup odometer not recorded — cannot compute kilometres used.' },
            { status: 400 },
          );
        }
        if (end_odometer_reading < (b.odometer_reading as number)) {
          return NextResponse.json(
            { error: `End odometer (${end_odometer_reading}) is less than pickup odometer (${b.odometer_reading}).` },
            { status: 400 },
          );
        }

        // Excess km — bike override wins over model default; ₹3 final fallback.
        const bikeRow: any  = Array.isArray(b.bike)  ? b.bike[0]  : b.bike;
        const modelRow: any = bikeRow?.model ? (Array.isArray(bikeRow.model) ? bikeRow.model[0] : bikeRow.model) : null;
        const extraKmRate    = Number(bikeRow?.extra_km_rate    ?? modelRow?.excess_km_rate     ?? 3);
        const latePerHourRate = Number(bikeRow?.late_penalty_hour ?? modelRow?.late_hourly_penalty ?? 49);

        const kmUsed   = end_odometer_reading - (b.odometer_reading as number);
        const kmLimit  = Number(b.km_limit ?? 0);
        const excessKm = kmUsed > kmLimit ? (kmUsed - kmLimit) : 0;
        const excessKmCharge = Math.round(excessKm * extraKmRate);

        // Late penalty — anything past end_ts. Partial hour rounds up so
        // a 70-minute overage costs 2 hours, matching the admin's policy
        // notice on the order confirmation card.
        const endMs    = new Date(b.end_ts as string).getTime();
        const lateMs   = Date.now() - endMs;
        const lateHrs  = lateMs > 0 ? Math.ceil(lateMs / 3_600_000) : 0;
        const lateCharge = Math.round(lateHrs * latePerHourRate);

        updates.end_odometer_reading = end_odometer_reading;
        updates.final_km_used        = kmUsed;
        updates.excess_km_charge     = excessKmCharge;
        updates.late_hours           = lateHrs;
        updates.late_charge          = lateCharge;
        if (damage_charge != null) updates.damage_charge = Math.round(damage_charge);
        break;
      }
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
