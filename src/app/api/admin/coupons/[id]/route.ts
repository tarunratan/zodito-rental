import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// All fields optional — admin can flip the active toggle alone, or send a
// full edit payload. Same shape as the create endpoint minus `code`.
const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  discount_type: z.enum(['percent', 'fixed', 'gst_waiver']).optional(),
  discount_value: z.number().min(0).optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  is_public: z.boolean().optional(),
  is_active: z.boolean().optional(),
  usage_scope: z.enum(['one_per_user', 'unlimited_per_user', 'first_booking_only']).optional(),
  expires_at: z.string().nullable().optional(),
  active_from: z.string().nullable().optional(),
  time_window_start: z.string().regex(timeRegex).nullable().optional(),
  time_window_end:   z.string().regex(timeRegex).nullable().optional(),
  valid_weekdays:    z.array(z.number().int().min(0).max(6)).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();

  const parse = patchSchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.errors[0].message }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const d = parse.data;

  const updates: Record<string, unknown> = {};
  if (d.label !== undefined)            updates.label = d.label;
  if (d.discount_type !== undefined)    updates.discount_type = d.discount_type;
  if (d.discount_value !== undefined)   updates.discount_value = d.discount_value;
  if (d.max_uses !== undefined)         updates.max_uses = d.max_uses;
  if (d.is_public !== undefined)        updates.is_public = d.is_public;
  if (d.is_active !== undefined)        updates.is_active = d.is_active;
  if (d.usage_scope !== undefined)      updates.usage_scope = d.usage_scope;
  if (d.expires_at !== undefined)       updates.expires_at = d.expires_at ? new Date(d.expires_at).toISOString() : null;
  if (d.active_from !== undefined)      updates.active_from = d.active_from ? new Date(d.active_from).toISOString() : null;
  if (d.time_window_start !== undefined) updates.time_window_start = d.time_window_start ?? null;
  if (d.time_window_end !== undefined)   updates.time_window_end   = d.time_window_end ?? null;
  if (d.valid_weekdays !== undefined)
    updates.valid_weekdays = d.valid_weekdays && d.valid_weekdays.length > 0 ? d.valid_weekdays : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', params.id);

  if (error) {
    console.error('Coupon update error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();

  // Remove usage history first to avoid FK constraint blocking deletion
  const { error: usesError } = await supabase.from('coupon_uses').delete().eq('coupon_id', params.id);
  if (usesError) return NextResponse.json({ error: 'Failed to clear coupon usage history' }, { status: 500 });

  const { error } = await supabase.from('coupons').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
