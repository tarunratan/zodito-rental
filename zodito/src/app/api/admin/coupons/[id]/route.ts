import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  // Only allow toggling is_active via PATCH
  const { error } = await supabase
    .from('coupons')
    .update({ is_active: !!body.is_active })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('coupons').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
