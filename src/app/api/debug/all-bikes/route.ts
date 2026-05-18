/**
 * Diagnostic endpoint — returns EVERY bike row with the flags that decide
 * customer-side visibility. No filtering. Intended for live-compare from
 * the home `?debug=1` overlay so admins can see what disappeared from the
 * grid (frozen / hidden / unapproved) without opening Supabase.
 *
 *   GET /api/debug/all-bikes
 *
 * No auth: returns only visibility-relevant columns + the model name. No
 * PII, no pricing, no vendor contact details.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, is_active, listing_status, is_frozen,
      frozen_from, frozen_until, freeze_reason,
      updated_at,
      model:bike_models(display_name)
    `)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((b: any) => ({
    id:              b.id,
    model_name:      b.model?.display_name ?? null,
    is_active:       b.is_active,
    listing_status:  b.listing_status,
    is_frozen:       b.is_frozen,
    frozen_from:     b.frozen_from,
    frozen_until:    b.frozen_until,
    freeze_reason:   b.freeze_reason,
    updated_at:      b.updated_at,
    visible_to_customers:
      b.is_active === true && b.listing_status === 'approved' && b.is_frozen !== true,
  }));

  return NextResponse.json(
    { fetched_at: new Date().toISOString(), total: rows.length, bikes: rows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
