/**
 * Helpers for writing to `booking_handover_logs`.
 *
 * Kept in one module so the handover endpoint and the status-update endpoint
 * use identical column shapes — drift between them would make the audit view
 * confusing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HandoverLogKind = 'save' | 'confirm' | 'start' | 'complete' | 'cancel' | 'refund';

interface AdminLike {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

function adminLabel(a: AdminLike | null | undefined): string | null {
  if (!a) return null;
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
  return name || a.email || null;
}

/**
 * Insert one audit row. Failures are logged but never thrown — audit logging
 * is best-effort and must not block the user-visible action.
 */
export async function writeHandoverLog(
  supabase: SupabaseClient,
  args: {
    booking_id: string;
    admin: AdminLike | null;
    kind: HandoverLogKind;
    payload?: Record<string, unknown> | null;
  },
) {
  try {
    const { error } = await supabase.from('booking_handover_logs').insert({
      booking_id: args.booking_id,
      admin_id:   args.admin?.id ?? null,
      admin_name: adminLabel(args.admin),
      kind:       args.kind,
      payload:    args.payload ?? null,
    });
    if (error) console.warn('[handover-audit] insert failed', error);
  } catch (e) {
    console.warn('[handover-audit] insert threw', e);
  }
}
