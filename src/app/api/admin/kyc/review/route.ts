import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const schema = z.object({
  user_id: z.string(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const admin = !isMockMode() ? await requireAdmin() : null;

    const parse = schema.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const { user_id, action, reason } = parse.data;

    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });

    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('users')
      .update({
        kyc_status: action === 'approve' ? 'approved' : 'rejected',
        kyc_rejection_reason: action === 'reject' ? reason || 'Please re-submit with clearer photos' : null,
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reviewed_by: admin?.id,
      })
      .eq('id', user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
