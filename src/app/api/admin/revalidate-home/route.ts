/**
 * Manual cache-bust endpoint for the home page (and an optional bike detail).
 *
 * Why this exists:
 *   When pricing is changed through the admin UI, the relevant PUT endpoint
 *   already calls `revalidatePath('/')` so customer-visible state refreshes
 *   on the next request. Changes made OUTSIDE the app — running a raw SQL
 *   script in the Supabase dashboard, restoring a backup, fixing rows by
 *   hand — bypass that hook, and the home page can keep serving the cached
 *   render for a while.
 *
 * Usage:
 *   POST /api/admin/revalidate-home              → home only
 *   POST /api/admin/revalidate-home?bike=<uuid>  → home + /bikes/<uuid>
 *
 * From a terminal after a SQL run:
 *   curl -X POST https://zoditorentals.com/api/admin/revalidate-home
 *
 * No body needed. Returns the list of paths that were invalidated so the
 * caller can confirm the right pages were touched.
 *
 * Auth: admin only — same gate as every other /api/admin/* endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { isMockMode } from '@/lib/mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isMockMode()) await requireAdmin();

    const bikeId = new URL(req.url).searchParams.get('bike');
    const invalidated: string[] = ['/'];

    revalidatePath('/');
    if (bikeId) {
      // Loose UUID shape check — we never query the DB here, so just guard
      // against accidental garbage in the query string.
      if (!/^[0-9a-f-]{8,}$/i.test(bikeId)) {
        return NextResponse.json({ error: 'bike query param must be a UUID' }, { status: 400 });
      }
      const path = `/bikes/${bikeId}`;
      revalidatePath(path);
      invalidated.push(path);
    }

    return NextResponse.json(
      { ok: true, invalidated, at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}

// GET is allowed too so admins can trigger it by just visiting the URL in a
// browser tab (the admin cookie travels with the request). Same logic.
export async function GET(req: NextRequest) {
  return POST(req);
}
