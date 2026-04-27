import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const createSchema = z.object({
  bike_id: z.string().uuid(),
  category: z.enum(['tyre', 'maintenance', 'repair', 'insurance', 'fuel', 'cleaning', 'parts', 'other']),
  description: z.string().min(1),
  amount: z.number().positive(),
  expense_date: z.string(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ expenses: [] });

    const supabase = createSupabaseAdmin();
    const bikeId = req.nextUrl.searchParams.get('bike_id');
    let q = supabase
      .from('bike_expenses')
      .select('*, bike:bikes(id, registration_number, emoji, model:bike_models(display_name))')
      .order('expense_date', { ascending: false });
    if (bikeId) q = q.eq('bike_id', bikeId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ expenses: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let admin: any = null;
    if (!isMockMode()) admin = await requireAdmin();

    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    if (isMockMode()) return NextResponse.json({ expense: { id: 'mock-' + Date.now(), ...parse.data } });

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('bike_expenses')
      .insert({ ...parse.data, recorded_by: admin?.id })
      .select('*, bike:bikes(id, registration_number, emoji, model:bike_models(display_name))')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ expense: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
