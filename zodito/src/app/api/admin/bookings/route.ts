import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode, mockBookingsStore } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') ?? '100');
    const offset = parseInt(searchParams.get('offset') ?? '0');

    if (isMockMode()) {
      return NextResponse.json({ bookings: mockBookingsStore, total: mockBookingsStore.length });
    }

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('bookings')
      .select(`
        *,
        user:users(id, email, first_name, last_name, phone),
        bike:bikes(id, registration_number, color, emoji, model:bike_models(display_name))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status as any);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bookings: data, total: count });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
