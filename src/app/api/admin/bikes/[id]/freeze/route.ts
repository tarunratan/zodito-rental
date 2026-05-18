/**
 * Freeze / unfreeze a bike.
 *
 * Post-migration 043: visibility is decided by the `bikes.is_frozen`
 * boolean — NOT by date math on `frozen_until`. The legacy date columns
 * are still accepted from the admin UI but they're informational only
 * (the admin can record "I plan to thaw on May 20" but the customer
 * doesn't see the bike either way while is_frozen=true).
 *
 * Accepted request shapes:
 *   { is_frozen: true,  frozen_until?: string, freeze_reason?: string }
 *   { is_frozen: false }
 *   // Legacy shapes still accepted — translated to is_frozen=true/false:
 *   { frozen_until: string, ... }                  → is_frozen=true
 *   { unfreeze: true }                             → is_frozen=false
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { isMockMode } from '@/lib/mock';
import { istLocalToUtcIso } from '@/lib/datetime';

export const runtime = 'nodejs';

const bodySchema = z.union([
  // New canonical shapes.
  z.object({
    is_frozen:     z.literal(true),
    frozen_from:   z.string().optional(),
    frozen_until:  z.string().optional(),
    freeze_reason: z.string().optional(),
  }),
  z.object({ is_frozen: z.literal(false) }),
  // Legacy shapes — preserved for older clients / scripts.
  z.object({ unfreeze: z.literal(true) }),
  z.object({
    frozen_from:   z.string().optional(),
    frozen_until:  z.string(), // legacy "freeze" had this as required
    freeze_reason: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isMockMode()) await requireAdmin();
    if (isMockMode()) return NextResponse.json({ ok: true, mock: true });

    const raw = await req.json();
    const parse = bodySchema.safeParse(raw);
    if (!parse.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const body = parse.data as any;

    // Decide which way the toggle is going.
    const goingToUnfreeze =
      ('is_frozen' in body && body.is_frozen === false) ||
      ('unfreeze'  in body && body.unfreeze  === true);

    const supabase = createSupabaseAdmin();
    let update: Record<string, any>;
    if (goingToUnfreeze) {
      // Clear everything — visibility AND metadata. Simple and unambiguous.
      update = {
        is_frozen:     false,
        frozen_from:   null,
        frozen_until:  null,
        freeze_reason: null,
        updated_at:    new Date().toISOString(),
      };
    } else {
      // Freezing. Normalize incoming wall-clock times as IST so a bare
      // datetime-local string never gets mis-stamped as UTC if the client
      // forgot to convert (defense in depth — the admin UI already converts).
      const frozenFromIso  = istLocalToUtcIso(body.frozen_from);
      const frozenUntilIso = istLocalToUtcIso(body.frozen_until);
      if (frozenFromIso && frozenUntilIso
          && new Date(frozenUntilIso) <= new Date(frozenFromIso)) {
        return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
      }
      update = {
        is_frozen:     true,
        frozen_from:   frozenFromIso,
        frozen_until:  frozenUntilIso,
        freeze_reason: body.freeze_reason || null,
        updated_at:    new Date().toISOString(),
      };
    }

    // Atomic write. Returns the updated row so the admin client can update
    // its local state from the source of truth — no optimistic divergence.
    const { data, error } = await supabase
      .from('bikes')
      .update(update)
      .eq('id', params.id)
      .select('id, is_active, listing_status, is_frozen, frozen_from, frozen_until, freeze_reason, updated_at')
      .single();

    if (error) {
      console.error('[api/admin/bikes/:id/freeze] update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust SSR / route cache so customer pages re-render with the new state.
    revalidatePath('/');
    revalidatePath(`/bikes/${params.id}`);
    return NextResponse.json({ ok: true, bike: data });
  } catch (e: any) {
    console.error('[api/admin/bikes/:id/freeze] unexpected error:', e?.message ?? e);
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
}
