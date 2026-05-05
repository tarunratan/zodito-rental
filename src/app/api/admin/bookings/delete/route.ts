import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const bodySchema = z.object({
  booking_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parse = bodySchema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid booking_id' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  // Safety: only allow deleting cancelled or payment_failed bookings
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', parse.data.booking_id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  if (!['cancelled', 'payment_failed'].includes(booking.status)) {
    return NextResponse.json(
      { error: `Only cancelled or payment_failed bookings can be deleted (current status: ${booking.status})` },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('bookings').delete().eq('id', parse.data.booking_id);
  if (error) {
    console.error('Booking delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
