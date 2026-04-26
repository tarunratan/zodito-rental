import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ vendors: [] });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? 'pending';

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('vendors')
      .select('*, user:users(id, email, first_name, last_name, phone)')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status as any);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ vendors: data });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
