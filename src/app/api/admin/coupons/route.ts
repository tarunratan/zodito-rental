import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const createSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, _ or -'),
  label: z.string().min(1).max(100),
  discount_type: z.enum(['percent', 'fixed', 'gst_waiver']),
  discount_value: z.number().min(0),
  max_uses: z.number().int().positive().nullable(),
  expires_at: z.string().nullable(),
  active_from: z.string().nullable().optional(),
  is_public: z.boolean().default(false),
  usage_scope: z.enum(['one_per_user', 'unlimited_per_user', 'first_booking_only']).default('one_per_user'),
  time_window_start: z.string().regex(timeRegex, 'Use HH:MM (24-hr IST)').nullable().optional(),
  time_window_end:   z.string().regex(timeRegex, 'Use HH:MM (24-hr IST)').nullable().optional(),
  valid_weekdays:    z.array(z.number().int().min(0).max(6)).nullable().optional(),
}).superRefine((d, ctx) => {
  const hasStart = !!d.time_window_start;
  const hasEnd   = !!d.time_window_end;
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasStart ? ['time_window_end'] : ['time_window_start'],
      message: 'Set both start and end, or leave both blank',
    });
  }
  if (d.valid_weekdays && d.valid_weekdays.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valid_weekdays'],
      message: 'Pick at least one day, or leave blank for all days',
    });
  }
});

export async function POST(req: NextRequest) {
  await requireAdmin();

  const parse = createSchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.errors[0].message }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const d = parse.data;
  const { data: coupon, error } = await supabase
    .from('coupons')
    .insert({
      code: d.code,
      label: d.label,
      discount_type: d.discount_type,
      discount_value: d.discount_value,
      max_uses: d.max_uses,
      is_public: d.is_public,
      usage_scope: d.usage_scope,
      expires_at:        d.expires_at        ? new Date(d.expires_at).toISOString()        : null,
      active_from:       d.active_from       ? new Date(d.active_from).toISOString()       : null,
      time_window_start: d.time_window_start ?? null,
      time_window_end:   d.time_window_end   ?? null,
      valid_weekdays:    d.valid_weekdays && d.valid_weekdays.length > 0 ? d.valid_weekdays : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Code "${d.code}" already exists` }, { status: 409 });
    }
    console.error('Coupon create error:', error);
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }

  return NextResponse.json({ coupon }, { status: 201 });
}
