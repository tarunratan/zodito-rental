import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAppUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });
    const user = await getCurrentAppUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const supabase = createSupabaseAdmin();

    // Resolve vendor
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!vendor) return NextResponse.json({ error: 'Not a vendor' }, { status: 403 });

    // Only allow removing draft or rejected bikes
    const { data: bike } = await supabase
      .from('bikes')
      .select('id, listing_status, vendor_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!bike || bike.vendor_id !== vendor.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (bike.listing_status !== 'draft' && bike.listing_status !== 'rejected') {
      return NextResponse.json({ error: 'Only draft or rejected bikes can be removed' }, { status: 409 });
    }

    const { error } = await supabase.from('bikes').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
