import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const schema = z.object({
  booking_id: z.string().uuid(),
  alternate_phone: z.string().nullable().optional(),
  odometer_reading: z.number().int().min(0).nullable().optional(),
  helmets_provided: z.number().int().min(0).max(10).optional(),
  original_dl_taken: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  pending_amount: z.number().min(0).optional(),
  security_deposit: z.number().min(0).optional(),
  payment_method_detail: z.enum(['cash', 'upi', 'online', 'partial_online']).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { booking_id, ...fields } = parse.data;
  const supabase = createSupabaseAdmin();

  const updates: Record<string, unknown> = {};
  if (fields.alternate_phone !== undefined) updates.alternate_phone = fields.alternate_phone;
  if (fields.odometer_reading !== undefined) updates.odometer_reading = fields.odometer_reading;
  if (fields.helmets_provided !== undefined) updates.helmets_provided = fields.helmets_provided;
  if (fields.original_dl_taken !== undefined) updates.original_dl_taken = fields.original_dl_taken;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.pending_amount !== undefined) {
    updates.pending_amount = fields.pending_amount;
    if (fields.pending_amount === 0) updates.payment_status = 'paid';
  }
  if (fields.security_deposit !== undefined) updates.security_deposit = fields.security_deposit;
  if (fields.payment_method_detail !== undefined) updates.payment_method_detail = fields.payment_method_detail;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('bookings').update(updates).eq('id', booking_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
