'use client';

/**
 * Live-polling companion to the server-rendered ?debug=1 panel on
 * /bikes/[id]. The server snapshot tells you what the page rendered with;
 * this component tells you what the DB row says RIGHT NOW (refresh every
 * 3s) so admins watching one tab while freezing from another can see the
 * row flip without a manual reload.
 *
 * Renders inline next to the static overlay. No-ops when `enabled` is
 * false — zero perf cost for non-debug visitors.
 */

import { useEffect, useState } from 'react';

type Snapshot = {
  fetchedAt: string;
  is_active: boolean | null;
  listing_status: string | null;
  is_frozen: boolean | null;
  frozen_from: string | null;
  frozen_until: string | null;
  freeze_reason: string | null;
  updated_at: string | null;
  visible: boolean;
  error?: string;
};

export function BikeDebugPoller({ bikeId, enabled }: { bikeId: string; enabled: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetch(`/api/debug/bike-raw?id=${encodeURIComponent(bikeId)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (!r.ok) {
          setSnap({
            fetchedAt: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
            is_active: null, listing_status: null, is_frozen: null,
            frozen_from: null, frozen_until: null, freeze_reason: null, updated_at: null,
            visible: false, error: `HTTP ${r.status}`,
          });
          return;
        }
        const j = await r.json();
        const d = j?.derived ?? {};
        setSnap({
          fetchedAt: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
          is_active: d.is_active_in_db ?? null,
          listing_status: d.listing_status_in_db ?? null,
          is_frozen: d.is_frozen_in_db ?? null,
          frozen_from: d.frozen_from_in_db ?? null,
          frozen_until: d.frozen_until_in_db ?? null,
          freeze_reason: d.freeze_reason_in_db ?? null,
          updated_at: j?.bike?.updated_at ?? null,
          visible: !!d.visible_to_customers_now,
        });
      } catch (e: any) {
        if (!cancelled) {
          setSnap(s => ({
            ...(s ?? { is_active: null, listing_status: null, is_frozen: null, frozen_from: null, frozen_until: null, freeze_reason: null, updated_at: null, visible: false }),
            fetchedAt: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
            error: e?.message ?? 'fetch failed',
          }));
        }
      }
    };
    pull();
    const t = setInterval(pull, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, [bikeId, enabled]);

  if (!enabled) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, maxWidth: 480,
      background: 'rgba(0,0,0,0.92)', color: '#fff', padding: '10px 12px', borderRadius: 10,
      fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 11, lineHeight: 1.5,
      zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#7cf' }}>
        [debug-live] DB poll every 3s {snap?.fetchedAt ? `· last ${snap.fetchedAt}` : ''}
      </div>
      {snap?.error && <div style={{ color: '#f88' }}>error: {snap.error}</div>}
      {snap && !snap.error && (
        <>
          <div>
            is_active=<span style={{ color: snap.is_active ? '#8f8' : '#f88' }}>{String(snap.is_active)}</span>
            {' · '}listing=<span style={{ color: snap.listing_status === 'approved' ? '#8f8' : '#f88' }}>{snap.listing_status}</span>
            {' · '}is_frozen=<span style={{ color: snap.is_frozen ? '#f88' : '#8f8' }}>{String(snap.is_frozen)}</span>
          </div>
          <div>
            visible_to_customers=<span style={{ color: snap.visible ? '#8f8' : '#f88', fontWeight: 700 }}>{snap.visible ? 'YES' : 'NO'}</span>
          </div>
          <div style={{ color: '#ccc' }}>frozen_from: {snap.frozen_from ?? '—'}</div>
          <div style={{ color: '#ccc' }}>frozen_until: {snap.frozen_until ?? '—'}</div>
          <div style={{ color: '#ccc' }}>freeze_reason: {snap.freeze_reason ?? '—'}</div>
          <div style={{ color: '#888', marginTop: 2 }}>updated_at: {snap.updated_at ?? '—'}</div>
        </>
      )}
    </div>
  );
}
