import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/admin/bookings/handover-logs?booking_id=...
 * Returns the audit trail for a single booking, newest first.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookingId = new URL(req.url).searchParams.get('booking_id');
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('booking_handover_logs')
    .select('id, kind, admin_name, payload, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [] });
}
