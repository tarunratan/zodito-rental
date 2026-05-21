/**
 * Rich activity timeline for a single booking. Stitches together:
 *
 *   - The synthetic "booking created" event from bookings.created_at +
 *     source + initial fields (no row in booking_handover_logs covers this).
 *   - Status transitions and field-level edits from booking_handover_logs.
 *   - Extensions (customer self-extends and admin-set settlements) from
 *     booking_extensions, with whether they were paid or expired.
 *
 * Returns events newest-first with a human-friendly `title` and
 * structured `meta` for richer UI rendering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { formatIstDateTime } from '@/lib/datetime';

export const runtime = 'nodejs';

type ActivityEvent = {
  id: string;
  ts: string;                  // ISO timestamp for sort + display
  kind:
    | 'created'
    | 'confirmed'
    | 'started'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | 'extended_paid'
    | 'extension_pending'
    | 'extension_failed'
    | 'extension_expired'
    | 'settlement_created'
    | 'handover_save'
    | 'note';
  title: string;               // First-line summary, admin-readable
  detail?: string | null;      // Optional second line / muted text
  actor?: string | null;       // Admin name when known
};

function rupee(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

// Friendly field renaming for handover-save events. The old logs just said
// "Updated handover details" which gave no actionable info; this expands
// to e.g. "Updated odometer (12,540 km), helmets (1)".
const FIELD_LABEL: Record<string, (v: any) => string> = {
  odometer_reading:    v => `odometer ${Number(v).toLocaleString('en-IN')} km`,
  helmets_provided:    v => `helmets ${v}`,
  original_dl_taken:   v => v ? 'DL taken' : 'DL not taken',
  alternate_phone:     v => `alt phone ${v || '—'}`,
  notes:               v => v ? `notes ("${String(v).slice(0, 40)}${String(v).length > 40 ? '…' : ''}")` : 'cleared notes',
  pending_amount:      v => `pending ${rupee(Number(v))}`,
  security_deposit:    v => `deposit ${rupee(Number(v))}`,
  payment_method_detail: v => `payment via ${v}`,
};

function describeHandoverSave(payload: Record<string, any> | null): string {
  if (!payload || typeof payload !== 'object') return 'Updated handover details';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    const fmt = FIELD_LABEL[k];
    if (fmt) parts.push(fmt(v));
  }
  if (parts.length === 0) return 'Updated handover details';
  if (parts.length === 1) return `Updated ${parts[0]}`;
  if (parts.length <= 3)  return `Updated ${parts.join(', ')}`;
  return `Updated ${parts.slice(0, 3).join(', ')} + ${parts.length - 3} more`;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookingId = new URL(req.url).searchParams.get('booking_id');
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  const [bookingRes, logsRes, extRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, booking_number, source, created_at, start_ts, end_ts, total_amount, package_tier, km_limit,
        customer_name, alternate_phone,
        user:users(id, first_name, last_name, email),
        bike:bikes(id, registration_number, color, model:bike_models(display_name, cc))
      `)
      .eq('id', bookingId)
      .maybeSingle(),
    supabase
      .from('booking_handover_logs')
      .select('id, kind, admin_name, payload, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('booking_extensions')
      .select('id, status, original_end_ts, new_end_ts, total_delta, base_delta, matched_tier, created_at, paid_at, razorpay_order_id')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false }),
  ]);

  const booking = bookingRes.data as any;
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const events: ActivityEvent[] = [];

  // ── Synthetic creation event — anchors the timeline. ───────────────────────
  const customerName = booking.user?.first_name || booking.user?.last_name
    ? [booking.user.first_name, booking.user.last_name].filter(Boolean).join(' ')
    : (booking.customer_name?.trim() || 'Customer');
  const bikeName = booking.bike?.model?.display_name ?? 'bike';
  const bikeReg  = booking.bike?.registration_number ? ` (${booking.bike.registration_number})` : '';
  const sourceLabel = booking.source === 'manual' ? 'Offline booking created' : 'Online booking placed';
  events.push({
    id:    `created-${booking.id}`,
    ts:    booking.created_at,
    kind:  'created',
    title: `${sourceLabel} by ${customerName}`,
    detail: `${bikeName}${bikeReg} · ${formatIstDateTime(booking.start_ts)} → ${formatIstDateTime(booking.end_ts)} · ${rupee(booking.total_amount)}`,
  });

  // ── Handover audit log entries — confirms, starts, completes, cancels,
  //    refunds, and save-events with field-level descriptions. ───────────────
  for (const log of logsRes.data ?? []) {
    let kind: ActivityEvent['kind'] = 'handover_save';
    let title = 'Updated handover details';
    switch (log.kind) {
      case 'confirm':  kind = 'confirmed';  title = 'Booking confirmed'; break;
      case 'start':    kind = 'started';    title = 'Ride started'; break;
      case 'complete': kind = 'completed';  title = 'Ride completed'; break;
      case 'cancel':   kind = 'cancelled';  title = 'Booking cancelled'; break;
      case 'refund':   kind = 'refunded';   title = 'Payment refunded'; break;
      case 'save':     kind = 'handover_save'; title = describeHandoverSave(log.payload); break;
    }
    // Cancellation often carries a reason — surface it as the detail line.
    let detail: string | null = null;
    if (log.kind === 'cancel' && log.payload?.reason) {
      detail = `Reason: ${log.payload.reason}`;
    } else if (log.payload?.note) {
      detail = String(log.payload.note);
    }
    events.push({
      id: log.id,
      ts: log.created_at,
      kind,
      title,
      detail,
      actor: log.admin_name ?? null,
    });
  }

  // ── Extension events — both successful and pending/failed for visibility. ──
  for (const ext of extRes.data ?? []) {
    const dropOffMoved = `Drop-off → ${formatIstDateTime(ext.new_end_ts)}`;
    if (ext.status === 'confirmed') {
      events.push({
        id:    `ext-${ext.id}`,
        ts:    ext.paid_at ?? ext.created_at,
        kind:  'extended_paid',
        title: `Booking extended · ${rupee(ext.total_delta)} paid`,
        detail: `${dropOffMoved}${ext.matched_tier ? ` · ${ext.matched_tier} tier` : ''}`,
      });
    } else if (ext.status === 'pending_payment') {
      // Pending + razorpay_order_id set means an admin generated a settlement
      // link; without the order ID it's a customer self-quote in progress.
      events.push({
        id:    `ext-${ext.id}`,
        ts:    ext.created_at,
        kind:  ext.razorpay_order_id ? 'settlement_created' : 'extension_pending',
        title: ext.razorpay_order_id
          ? `Settlement link sent · ${rupee(ext.total_delta)} pending`
          : `Extension quote pending · ${rupee(ext.total_delta)}`,
        detail: dropOffMoved,
      });
    } else if (ext.status === 'expired') {
      events.push({
        id:    `ext-${ext.id}`,
        ts:    ext.created_at,
        kind:  'extension_expired',
        title: `Extension link expired · ${rupee(ext.total_delta)} unpaid`,
        detail: dropOffMoved,
      });
    } else if (ext.status === 'failed') {
      events.push({
        id:    `ext-${ext.id}`,
        ts:    ext.created_at,
        kind:  'extension_failed',
        title: 'Extension payment failed',
        detail: dropOffMoved,
      });
    }
  }

  // Sort newest first so the modal shows recent activity at the top.
  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // High-level overview — single-paragraph summary the admin can glance at.
  const overview = buildOverview(booking, events);

  return NextResponse.json({
    booking_number: booking.booking_number,
    overview,
    events,
  });
}

function buildOverview(booking: any, events: ActivityEvent[]): string {
  const customerName = booking.user?.first_name || booking.user?.last_name
    ? [booking.user.first_name, booking.user.last_name].filter(Boolean).join(' ')
    : (booking.customer_name?.trim() || 'Customer');
  const bikeName = booking.bike?.model?.display_name ?? 'bike';
  const isManual = booking.source === 'manual';

  const extensionsPaid = events.filter(e => e.kind === 'extended_paid').length;
  const settlementsSent = events.filter(e => e.kind === 'settlement_created').length;
  const wasCancelled = events.some(e => e.kind === 'cancelled');
  const wasCompleted = events.some(e => e.kind === 'completed');
  const wasStarted   = events.some(e => e.kind === 'started');

  const bits: string[] = [];
  bits.push(`${customerName} booked ${bikeName} ${isManual ? 'offline (walk-in)' : 'online'} on ${formatIstDateTime(booking.created_at)}.`);

  if (wasCompleted)       bits.push('Ride completed.');
  else if (wasCancelled)  bits.push('Booking cancelled.');
  else if (wasStarted)    bits.push('Ride in progress.');
  else                    bits.push('Awaiting pickup.');

  if (extensionsPaid > 0) bits.push(`${extensionsPaid} extension${extensionsPaid === 1 ? '' : 's'} paid.`);
  if (settlementsSent > 0 && !wasCancelled && !wasCompleted) {
    bits.push(`${settlementsSent} settlement link${settlementsSent === 1 ? '' : 's'} pending payment.`);
  }

  return bits.join(' ');
}
