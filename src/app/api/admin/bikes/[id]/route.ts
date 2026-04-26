import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const updateSchema = z.object({
  model_id: z.string().uuid().optional(),
  registration_number: z.string().optional().nullable(),
  color: z.string().min(2).optional(),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  year: z.number().int().min(2000).max(2030).optional(),
  emoji: z.string().max(4).optional(),
  image_url: z.string().url().optional().nullable(),
  image_url_2: z.string().url().optional().nullable(),
  image_url_3: z.string().url().optional().nullable(),
  listing_status: z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'inactive']).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const parse = updateSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('bikes')
      .update({ ...parse.data, updated_at: new Date().toISOString() })
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from('bikes').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
