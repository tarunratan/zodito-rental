import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const freezeSchema = z.union([
  z.object({
    unfreeze: z.literal(true),
  }),
  z.object({
    frozen_from: z.string(),
    frozen_until: z.string(),
    freeze_reason: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();

    const body = await req.json();
    const parse = freezeSchema.safeParse(body);
    if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const supabase = createSupabaseAdmin();

    if ('unfreeze' in parse.data) {
      const { error } = await supabase
        .from('bikes')
        .update({ frozen_from: null, frozen_until: null, freeze_reason: null })
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: 'unfrozen' });
    }

    const { frozen_from, frozen_until, freeze_reason } = parse.data;
    if (new Date(frozen_until) <= new Date(frozen_from)) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    const { error } = await supabase
      .from('bikes')
      .update({ frozen_from, frozen_until, freeze_reason })
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'frozen' });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
