import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const schema = z.object({
  model_id: z.string(),
  registration_number: z.string().optional(),
  color: z.string().min(2),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  year: z.number().int().min(2000).max(2030),
  emoji: z.string().max(4),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  const body = parse.data;

  if (isMockMode()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const supabase = createSupabaseAdmin();

  // Get the vendor record
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!vendor || vendor.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved vendors can list bikes' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('bikes').insert({
    model_id: body.model_id,
    owner_type: 'vendor',
    vendor_id: vendor.id,
    registration_number: body.registration_number || null,
    color: body.color,
    color_hex: body.color_hex || null,
    year: body.year,
    emoji: body.emoji,
    listing_status: 'pending_approval',
    is_active: false,  // goes live when admin approves
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A bike with that registration number already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
