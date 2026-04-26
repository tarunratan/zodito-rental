import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const createSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, _ or -'),
  label: z.string().min(1).max(100),
  discount_type: z.enum(['percent', 'fixed', 'gst_waiver']),
  discount_value: z.number().min(0),
  max_uses: z.number().int().positive().nullable(),
  expires_at: z.string().nullable(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();

  const parse = createSchema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.errors[0].message }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: coupon, error } = await supabase
    .from('coupons')
    .insert({
      ...parse.data,
      expires_at: parse.data.expires_at ? new Date(parse.data.expires_at).toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Code "${parse.data.code}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }

  return NextResponse.json({ coupon }, { status: 201 });
}
