import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = await req.json();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('coupons')
    .update({ is_active: !!body.is_active })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();

  // Remove usage history first to avoid FK constraint blocking deletion
  const { error: usesError } = await supabase.from('coupon_uses').delete().eq('coupon_id', params.id);
  if (usesError) return NextResponse.json({ error: 'Failed to clear coupon usage history' }, { status: 500 });

  const { error } = await supabase.from('coupons').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
