import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ expenses: [] });

    const { searchParams } = new URL(req.url);
    const bike_id = searchParams.get('bike_id');

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('bike_expenses')
      .select(`
        *,
        bike:bikes(id, registration_number, emoji, model:bike_models(display_name)),
        recorded_by_user:users!recorded_by(first_name, last_name)
      `)
      .order('expense_date', { ascending: false });

    if (bike_id) query = query.eq('bike_id', bike_id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ expenses: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

const createSchema = z.object({
  bike_id: z.string().uuid(),
  category: z.enum(['tyre', 'maintenance', 'repair', 'insurance', 'fuel', 'cleaning', 'parts', 'other']),
  description: z.string().min(1),
  amount: z.number().positive(),
  expense_date: z.string(),
  receipt_url: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    const admin = await requireAdmin();

    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data: ' + parse.error.message }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('bike_expenses')
      .insert({ ...parse.data, recorded_by: admin.id })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, expense: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
