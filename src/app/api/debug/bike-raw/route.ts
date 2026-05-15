/**
 * Diagnostic endpoint — returns the raw `bikes` row for a given id, plus a
 * derived "should it be visible to customers right now?" verdict.
 *
 * WHY THIS EXISTS
 * When a bike "appears on home despite being frozen / hidden", we need to
 * know whether the DB actually reflects the admin's last action. The
 * customer-facing API answers "is it available?" — this endpoint answers
 * the more fundamental "what is the row actually storing?".
 *
 * USAGE
 *   /api/debug/bike-raw?id=<uuid>
 *
 * No auth: returns only the columns relevant to visibility (no PII, no
 * pricing internals). Anyone holding a bike id can read these.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, is_active, listing_status,
      frozen_from, frozen_until, freeze_reason,
      created_at, updated_at,
      model:bike_models(display_name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found', id }, { status: 404 });
  }

  const now = new Date();
  const frozenUntil = (data as any).frozen_until ? new Date((data as any).frozen_until) : null;
  const frozenFrom  = (data as any).frozen_from  ? new Date((data as any).frozen_from)  : null;
  const freezeActiveNow = !!frozenUntil && frozenUntil > now && (!frozenFrom || frozenFrom <= now);

  return NextResponse.json(
    {
      bike: data,
      derived: {
        // Why a customer would or wouldn't see this bike right now,
        // independent of the [from, to] window the home page is using.
        visible_to_customers_now: (data as any).is_active === true
          && (data as any).listing_status === 'approved'
          && !freezeActiveNow,
        is_active_in_db:      (data as any).is_active,
        listing_status_in_db: (data as any).listing_status,
        freeze_active_now:    freezeActiveNow,
        frozen_from_in_db:    (data as any).frozen_from,
        frozen_until_in_db:   (data as any).frozen_until,
        freeze_reason_in_db:  (data as any).freeze_reason,
        server_now:           now.toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
