import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

const schema = z.object({
  business_name: z.string().min(2),
  contact_phone: z.string().min(10),
  contact_email: z.string().email().optional().or(z.literal('')),
  pickup_area: z.string().min(2),
  pickup_address: z.string().min(10),
  upi_id: z.string().optional().or(z.literal('')),
  bank_account_name: z.string().optional().or(z.literal('')),
  bank_account_number: z.string().optional().or(z.literal('')),
  bank_ifsc: z.string().optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const body = parse.data;

  if (isMockMode()) {
    return NextResponse.json({ ok: true, mock: true, status: 'pending' });
  }

  const supabase = createSupabaseAdmin();

  // Check if a vendor row already exists — if so, allow re-apply only if rejected
  const { data: existing } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'rejected') {
      return NextResponse.json(
        { error: `You already have a ${existing.status} application` },
        { status: 409 }
      );
    }
    // Re-apply: update existing row back to pending
    const { error } = await supabase
      .from('vendors')
      .update({
        business_name: body.business_name,
        contact_phone: body.contact_phone,
        contact_email: body.contact_email || null,
        pickup_area: body.pickup_area,
        pickup_address: body.pickup_address,
        upi_id: body.upi_id || null,
        bank_account_name: body.bank_account_name || null,
        bank_account_number: body.bank_account_number || null,
        bank_ifsc: body.bank_ifsc || null,
        status: 'pending',
        approval_notes: null,
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, resubmitted: true });
  }

  // Create a new vendor row
  const { error } = await supabase.from('vendors').insert({
    user_id: user.id,
    business_name: body.business_name,
    contact_phone: body.contact_phone,
    contact_email: body.contact_email || null,
    pickup_area: body.pickup_area,
    pickup_address: body.pickup_address,
    upi_id: body.upi_id || null,
    bank_account_name: body.bank_account_name || null,
    bank_account_number: body.bank_account_number || null,
    bank_ifsc: body.bank_ifsc || null,
    status: 'pending',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
