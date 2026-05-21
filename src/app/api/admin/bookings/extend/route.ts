import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isWithinStoreHours } from '@/lib/pricing';
import { writeHandoverLog } from '@/lib/handover-audit';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string().uuid(),
  new_end_ts: z.string().datetime(),
  amount_collected: z.number().min(0).optional(),
  extra_km: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parse = schema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { booking_id, new_end_ts, amount_collected, extra_km } = parse.data;

  const supabase = createSupabaseAdmin();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, end_ts, status, advance_paid, pending_amount, km_limit, user_id, booking_number')
    .eq('id', booking_id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (!['confirmed', 'ongoing'].includes(booking.status)) {
    return NextResponse.json({ error: 'Can only extend confirmed or ongoing bookings' }, { status: 400 });
  }
  if (new Date(new_end_ts) <= new Date(booking.end_ts)) {
    return NextResponse.json({ error: 'New end time must be after current end time' }, { status: 400 });
  }
  // Store window guard — UI restricts the picker to 6 AM – 10 PM IST, but the
  // API stands on its own. Reject any drop-off that falls outside the window.
  if (!isWithinStoreHours(new Date(new_end_ts))) {
    return NextResponse.json(
      { error: 'Drop-offs accepted only between 6 AM and 10:30 PM IST' },
      { status: 400 },
    );
  }

  const collected     = amount_collected != null && amount_collected > 0 ? amount_collected : 0;
  const extraKmAdded  = extra_km          != null && extra_km > 0         ? extra_km          : 0;
  const originalEnd   = booking.end_ts as string;
  const originalKmLim = Number(booking.km_limit ?? 0);
  const newKmLim      = originalKmLim + extraKmAdded;
  const extraHours    = (new Date(new_end_ts).getTime() - new Date(originalEnd).getTime()) / 3_600_000;
  const nowIso        = new Date().toISOString();

  // Insert a booking_extensions row BEFORE mutating bookings.end_ts. Marks
  // the extension as confirmed + paid immediately since the admin already
  // collected (or is recording a zero-amount extension). gst_delta=0 mirrors
  // the GST-waived policy. matched_tier='admin' is a sentinel so the UI can
  // label these rows as admin-recorded vs customer self-extends.
  const { error: extInsertErr } = await supabase
    .from('booking_extensions')
    .insert({
      booking_id:        booking.id,
      user_id:           booking.user_id,
      status:            'confirmed',
      original_end_ts:   originalEnd,
      new_end_ts:        new_end_ts,
      extra_hours:       Number(extraHours.toFixed(2)),
      original_km_limit: originalKmLim,
      extra_km:          extraKmAdded,
      new_km_limit:      newKmLim,
      base_delta:        collected,
      gst_delta:         0,
      total_delta:       collected,
      matched_tier:      'admin',
      paid_at:           nowIso,
    });
  if (extInsertErr) {
    // RLS / FK / constraint failures bubble up cleanly so the operator
    // knows the audit row didn't land — better to abort than silently
    // mutate end_ts and lose the trail.
    return NextResponse.json({ error: 'Could not record extension: ' + extInsertErr.message }, { status: 500 });
  }

  // Then mutate the booking itself.
  const updates: Record<string, unknown> = { end_ts: new_end_ts };
  if (collected > 0) {
    const newAdvance = Number(booking.advance_paid ?? 0) + collected;
    const newPending = Math.max(0, Number(booking.pending_amount ?? 0) - collected);
    updates.advance_paid   = newAdvance;
    updates.pending_amount = newPending;
    if (newPending === 0) updates.payment_status = 'paid';
  }
  if (extraKmAdded > 0) updates.km_limit = newKmLim;

  const { error } = await supabase.from('bookings').update(updates).eq('id', booking_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Handover-log entry so the activity timeline picks it up too. The
  // /activity endpoint reads from booking_extensions for the rich card,
  // and from booking_handover_logs for the inline timeline event — write
  // to both so neither surface comes up empty.
  await writeHandoverLog(supabase, {
    booking_id,
    admin,
    kind: 'save',
    payload: {
      action: 'admin_extend',
      from: originalEnd,
      to: new_end_ts,
      extra_hours: Number(extraHours.toFixed(2)),
      extra_km: extraKmAdded,
      amount_collected: collected,
    },
  });

  return NextResponse.json({ ok: true, updates });
}
