import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const freezeSchema = z.object({
  frozen_from: z.string().optional(),
  frozen_until: z.string(),
  freeze_reason: z.string().optional(),
});

const unfreezeSchema = z.object({ unfreeze: z.literal(true) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });

    const body = await req.json();

    const unfreezeResult = unfreezeSchema.safeParse(body);
    if (unfreezeResult.success) {
      const supabase = createSupabaseAdmin();
      const { error } = await supabase
        .from('bikes')
        .update({ frozen_from: null, frozen_until: null, freeze_reason: null })
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const freezeResult = freezeSchema.safeParse(body);
    if (!freezeResult.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { frozen_from, frozen_until, freeze_reason } = freezeResult.data;

    if (frozen_from && new Date(frozen_until) <= new Date(frozen_from)) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('bikes')
      .update({ frozen_from: frozen_from || null, frozen_until, freeze_reason: freeze_reason || null })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
