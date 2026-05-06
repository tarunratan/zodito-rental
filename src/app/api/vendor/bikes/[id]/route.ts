import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const schema = z.object({
  is_active: z.boolean(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (user.role !== 'vendor') return NextResponse.json({ error: 'Vendor only' }, { status: 403 });

  const parse = schema.safeParse(await req.json());
  if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const supabase = createSupabaseAdmin();

  // Verify this bike belongs to the vendor before updating
  const { data: bike } = await supabase
    .from('bikes')
    .select('id, vendor_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!bike) return NextResponse.json({ error: 'Bike not found' }, { status: 404 });

  // Get vendor record for this user
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!vendor || bike.vendor_id !== vendor.id) {
    return NextResponse.json({ error: 'Not your bike' }, { status: 403 });
  }

  const { error } = await supabase
    .from('bikes')
    .update({ is_active: parse.data.is_active })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
