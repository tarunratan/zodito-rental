import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore } from '@/lib/mock';
import { sendBookingStatusUpdate } from '@/lib/email';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string(),
  status: z.enum(['ongoing', 'completed', 'cancelled', 'refunded']),
  reason: z.string().nullish(),  // accepts string | null | undefined
});

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

    const updates: Record<string, unknown> = { updated_at: now };
    switch (status) {
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

    // Send status email (fire-and-forget)
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
