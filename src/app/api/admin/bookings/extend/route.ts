import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string().uuid(),
  new_end_ts: z.string().datetime(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parse = schema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { booking_id, new_end_ts } = parse.data;

  const supabase = createSupabaseAdmin();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, end_ts, status')
    .eq('id', booking_id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (!['confirmed', 'ongoing'].includes(booking.status)) {
    return NextResponse.json({ error: 'Can only extend confirmed or ongoing bookings' }, { status: 400 });
  }
  if (new Date(new_end_ts) <= new Date(booking.end_ts)) {
    return NextResponse.json({ error: 'New end time must be after current end time' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bookings')
    .update({ end_ts: new_end_ts })
    .eq('id', booking_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
