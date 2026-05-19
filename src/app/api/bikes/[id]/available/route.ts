/**
 * Per-bike availability check — used by the detail page's BookingFlow.
 *
 * Now a thin wrapper around the canonical `bike_states` SQL function
 * (migration 040). Every visibility / booking / freeze predicate lives
 * inside the SQL projection so this route can NEVER disagree with the
 * home list or any other consumer of bike state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBikeState } from '@/lib/bike-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const NO_STORE: HeadersInit = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400, headers: NO_STORE });
  }
  const fromTs = new Date(fromParam);
  const toTs   = new Date(toParam);
  if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime()) || toTs <= fromTs) {
    return NextResponse.json({ available: true }, { headers: NO_STORE });
  }

  try {
    const state = await getBikeState(params.id, fromTs, toTs);
    if (!state) {
      return NextResponse.json({ available: false, reason: 'not_found' }, { headers: NO_STORE });
    }
    if (state.available) {
      return NextResponse.json({ available: true }, { headers: NO_STORE });
    }
    return NextResponse.json(
      { available: false, reason: state.reason, frozen_until: state.frozen_until },
      { headers: NO_STORE },
    );
  } catch (e: any) {
    console.error('[api/bikes/[id]/available] error:', e?.message ?? e);
    return NextResponse.json({ available: null, error: 'state lookup failed' }, { status: 500, headers: NO_STORE });
  }
}
