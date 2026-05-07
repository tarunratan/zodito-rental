import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

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
    .select('id, end_ts, status, advance_paid, pending_amount, km_limit')
    .eq('id', booking_id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (!['confirmed', 'ongoing'].includes(booking.status)) {
    return NextResponse.json({ error: 'Can only extend confirmed or ongoing bookings' }, { status: 400 });
  }
  if (new Date(new_end_ts) <= new Date(booking.end_ts)) {
    return NextResponse.json({ error: 'New end time must be after current end time' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { end_ts: new_end_ts };

  if (amount_collected != null && amount_collected > 0) {
    const newAdvance = Number(booking.advance_paid ?? 0) + amount_collected;
    const newPending = Math.max(0, Number(booking.pending_amount ?? 0) - amount_collected);
    updates.advance_paid    = newAdvance;
    updates.pending_amount  = newPending;
    if (newPending === 0) updates.payment_status = 'paid';
  }

  if (extra_km != null && extra_km > 0) {
    updates.km_limit = Number(booking.km_limit ?? 0) + extra_km;
  }

  const { error } = await supabase.from('bookings').update(updates).eq('id', booking_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updates });
}
