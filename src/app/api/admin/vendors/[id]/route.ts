/**
 * Full admin CRUD on a single vendor.
 *
 *   PATCH /api/admin/vendors/<id>
 *     Update any subset of: business_name, contact_phone, contact_email,
 *     pickup_address, pickup_area, commission_pct, status.
 *
 * Status changes go through here for the post-approval lifecycle
 * (approved → suspended → approved again, etc.). The /review endpoint
 * remains the canonical entry point for the FIRST-TIME approve/reject
 * decision because it also writes vendor user role + sends emails.
 *
 * Delete intentionally not implemented — cascading from vendors → bikes →
 * bookings is risky without a migration to scrub paid history. Use
 * status='suspended' instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  business_name:  z.string().min(1).max(120).optional(),
  contact_phone:  z.string().min(6).max(20).optional(),
  contact_email:  z.string().email().nullable().optional(),
  pickup_address: z.string().min(1).max(500).optional(),
  pickup_area:    z.string().min(1).max(120).optional(),
  commission_pct: z.number().min(0).max(100).optional(),
  status:         z.enum(['approved', 'suspended', 'rejected']).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parse = patchSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Build the update payload. The DB's BEFORE-UPDATE trigger handles
  // updated_at, so we don't set it here.
  const updates: Record<string, unknown> = { ...parse.data };

  const { data, error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', params.id)
    .select('id, business_name, contact_phone, contact_email, pickup_address, pickup_area, commission_pct, status, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, vendor: data });
}
