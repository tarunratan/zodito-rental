import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (isMockMode()) return NextResponse.json({ bikes: [] });
    await requireAdmin();
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('bikes')
      .select(`
        *,
        model:bike_models(id, display_name, name, category, cc),
        vendor:vendors(id, business_name, pickup_area)
      `)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bikes: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

const createSchema = z.object({
  model_id: z.string().uuid(),
  registration_number: z.string().optional(),
  color: z.string().min(2),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  year: z.number().int().min(2000).max(2030),
  emoji: z.string().max(4).default('🏍️'),
  image_url: z.string().url().optional().nullable(),
  image_url_2: z.string().url().optional().nullable(),
  image_url_3: z.string().url().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    const admin = await requireAdmin();
    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
    const body = parse.data;

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from('bikes').insert({
      model_id: body.model_id,
      owner_type: 'platform',
      vendor_id: null,
      registration_number: body.registration_number || null,
      color: body.color,
      color_hex: body.color_hex || null,
      year: body.year,
      emoji: body.emoji,
      image_url: body.image_url || null,
      image_url_2: body.image_url_2 || null,
      image_url_3: body.image_url_3 || null,
      listing_status: 'approved',
      is_active: true,
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Registration number already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
