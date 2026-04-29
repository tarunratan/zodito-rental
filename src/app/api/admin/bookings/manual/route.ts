import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const schema = z.object({
  bike_id: z.string().uuid(),
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().min(6, 'Phone number is required'),
  customer_email: z.string().email().optional().or(z.literal('')),
  start_ts: z.string(),
  end_ts: z.string(),
  total_amount: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const parse = schema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { bike_id, customer_name, customer_phone, start_ts, end_ts, total_amount, notes } = parse.data;
  const startTs = new Date(start_ts);
  const endTs = new Date(end_ts);

  if (endTs <= startTs) {
    return NextResponse.json({ error: 'Drop-off must be after pickup' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const startIso = startTs.toISOString();
  const endIso = endTs.toISOString();

  // Parallel: check booking overlap + freeze window — independent reads
  const [overlapRes, bikeRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, booking_number')
      .eq('bike_id', bike_id)
      .not('status', 'in', '(cancelled,payment_failed)')
      .lt('start_ts', endIso)
      .gt('end_ts', startIso)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bikes')
      .select('id, frozen_from, frozen_until, freeze_reason')
      .eq('id', bike_id)
      .maybeSingle(),
  ]);

  if (overlapRes.data) {
    return NextResponse.json(
      { error: `Bike already booked (#${overlapRes.data.booking_number}) for that period` },
      { status: 409 }
    );
  }

  const bike = bikeRes.data;
  if (bike?.frozen_until && bike?.frozen_from) {
    const ff = new Date(bike.frozen_from);
    const fu = new Date(bike.frozen_until);
    if (ff < endTs && fu > startTs) {
      return NextResponse.json(
        { error: `Bike is frozen until ${fu.toLocaleString('en-IN')}${bike.freeze_reason ? ': ' + bike.freeze_reason : ''}` },
        { status: 409 }
      );
    }
  }

  const bookingNumber = 'ZD-MNL-' + Date.now().toString(36).toUpperCase();

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      bike_id,
      customer_name,
      customer_phone,
      start_ts: startIso,
      end_ts: endIso,
      status: 'confirmed',
      payment_status: 'paid',
      source: 'manual',
      booking_number: bookingNumber,
      notes: notes || null,
      total_amount,
      base_price: total_amount,
      km_limit: 0,
      extra_helmet_count: 0,
      extra_helmet_price: 0,
      security_deposit: 0,
      subtotal: total_amount,
      gst_amount: 0,
      coupon_discount: 0,
      platform_commission: total_amount,
      vendor_payout: 0,
      package_tier: '24hr',
    })
    .select('id, booking_number')
    .single();

  if (error) {
    console.error('Manual booking error:', error);
    return NextResponse.json({ error: 'Failed to create booking: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, booking_id: booking.id, booking_number: booking.booking_number });
}
