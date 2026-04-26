import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const updateSchema = z.object({
  category: z.enum(['tyre', 'maintenance', 'repair', 'insurance', 'fuel', 'cleaning', 'parts', 'other']).optional(),
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  expense_date: z.string().optional(),
  receipt_url: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    await requireAdmin();

    const parse = updateSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('bike_expenses')
      .update(parse.data)
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
    const { error } = await supabase.from('bike_expenses').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
