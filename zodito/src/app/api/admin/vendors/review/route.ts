import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { sendVendorApproved, sendVendorRejected } from '@/lib/email';

export const runtime = 'nodejs';

const schema = z.object({
  vendor_id: z.string(),
  action: z.enum(['approve', 'reject']),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { vendor_id, action, notes } = parse.data;

  if (isMockMode()) return NextResponse.json({ ok: true, mock: true });

  const supabase = createSupabaseAdmin();

  const { data: vendor, error } = await supabase
    .from('vendors')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      approval_notes: notes || null,
      approved_at: action === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', vendor_id)
    .select('user_id, business_name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action === 'approve' && vendor) {
    await supabase
      .from('users')
      .update({ role: 'vendor' })
      .eq('id', vendor.user_id)
      .neq('role', 'admin');
  }

  // Send email (fire-and-forget)
  if (vendor?.user_id) {
    const { data: u } = await supabase
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', vendor.user_id)
      .maybeSingle();
    if (u?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zoditorentals.com';
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '';
      const businessName = vendor.business_name;
      if (action === 'approve') {
        sendVendorApproved({ to: u.email, name, businessName, appUrl }).catch(console.error);
      } else {
        sendVendorRejected({ to: u.email, name, businessName, notes: notes || '', appUrl }).catch(console.error);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
