import { describe, it, expect } from 'vitest';
import { istLocalToUtcIso, utcToIstLocal } from '../datetime';

describe('istLocalToUtcIso', () => {
  it('treats bare datetime-local as IST and returns UTC ISO', () => {
    // 2:00 PM IST = 8:30 AM UTC
    expect(istLocalToUtcIso('2026-05-20T14:00')).toBe('2026-05-20T08:30:00.000Z');
  });

  it('handles midnight IST crossing day boundary into UTC', () => {
    // 00:30 IST on May 20 = 19:00 UTC on May 19
    expect(istLocalToUtcIso('2026-05-20T00:30')).toBe('2026-05-19T19:00:00.000Z');
  });

  it('accepts datetime-local with seconds', () => {
    expect(istLocalToUtcIso('2026-05-20T14:00:45')).toBe('2026-05-20T08:30:45.000Z');
  });

  it('preserves explicit Z timezone unchanged', () => {
    expect(istLocalToUtcIso('2026-05-20T08:30:00.000Z')).toBe('2026-05-20T08:30:00.000Z');
  });

  it('preserves explicit numeric offset', () => {
    // 14:00 +05:30 = 08:30 UTC
    expect(istLocalToUtcIso('2026-05-20T14:00:00+05:30')).toBe('2026-05-20T08:30:00.000Z');
  });

  it('returns null for empty / nullish input', () => {
    expect(istLocalToUtcIso('')).toBeNull();
    expect(istLocalToUtcIso(null)).toBeNull();
    expect(istLocalToUtcIso(undefined)).toBeNull();
    expect(istLocalToUtcIso('   ')).toBeNull();
  });
});

describe('utcToIstLocal', () => {
  it('formats UTC ISO as IST datetime-local string', () => {
    expect(utcToIstLocal('2026-05-20T08:30:00.000Z')).toBe('2026-05-20T14:00');
  });

  it('handles day rollover when UTC is late evening', () => {
    // 22:00 UTC = 03:30 IST next day
    expect(utcToIstLocal('2026-05-19T22:00:00.000Z')).toBe('2026-05-20T03:30');
  });

  it('round-trips through istLocalToUtcIso', () => {
    const local = '2026-05-20T14:00';
    expect(utcToIstLocal(istLocalToUtcIso(local)!)).toBe(local);
  });

  it('returns empty string for empty / invalid input', () => {
    expect(utcToIstLocal('')).toBe('');
    expect(utcToIstLocal(null)).toBe('');
    expect(utcToIstLocal('not-a-date')).toBe('');
  });
});
