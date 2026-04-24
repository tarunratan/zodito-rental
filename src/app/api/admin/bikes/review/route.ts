import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const schema = z.object({
  bike_id: z.string(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const admin = !isMockMode() ? await requireAdmin() : null;

    const parse = schema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const { bike_id, action, reason } = parse.data;

    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('bikes')
      .update({
        listing_status: action === 'approve' ? 'approved' : 'rejected',
        is_active: action === 'approve',
        rejection_reason: reason || null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        approved_by: action === 'approve' ? admin!.id : null,
      })
      .eq('id', bike_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
