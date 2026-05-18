/**
 * IST datetime helpers.
 *
 * Zodito operates in Hyderabad — every wall-clock time entered by an admin
 * or customer means IST. But `<input type="datetime-local">` produces strings
 * like "2026-05-20T14:00" with no timezone, and `new Date(string)` then
 * interprets that in the runtime's local timezone:
 *   - in the admin's browser: usually IST, but not guaranteed
 *   - on Vercel / Node: always UTC
 *
 * Passing that bare string through `new Date(...).toISOString()` on a UTC
 * server stores "14:00 UTC" — 5h 30m off from what the admin meant. This
 * module fixes that at the boundary: any time a datetime-local value crosses
 * into a persisted ISO string, route it through `istLocalToUtcIso` so the
 * conversion is timezone-deterministic regardless of where it runs.
 */

export const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30

/**
 * Convert a `<input type="datetime-local">` value (or any "YYYY-MM-DDTHH:mm"
 * string without timezone info) into a UTC ISO string, treating the input as
 * Asia/Kolkata wall-clock time.
 *
 * If the string already carries a timezone designator (`Z` or `±HH:MM`), it
 * is returned as a normalized ISO string unchanged — callers can pass either
 * shape without thinking about it.
 *
 * Returns `null` for empty / nullish input so callsites can write
 * `istLocalToUtcIso(form.x) ?? null`.
 */
export function istLocalToUtcIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Already has a timezone — let Date parse it natively and round-trip.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Bare local form. Accept either "YYYY-MM-DDTHH:mm" or
  // "YYYY-MM-DDTHH:mm:ss[.fff]".
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!m) {
    // Unknown shape — fall back to native parsing but at least don't silently
    // mis-tag it as IST.
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const [, y, mo, d, h, mi, sec = '0', ms = '0'] = m;
  // Build the equivalent UTC instant for an IST wall-clock time by anchoring
  // at UTC and subtracting the IST offset.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, +ms.padEnd(3, '0'))
              - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * Inverse of `istLocalToUtcIso`: take a UTC ISO string (anything `new Date`
 * can parse) and return a "YYYY-MM-DDTHH:mm" string in IST wall-clock,
 * suitable for prefilling a `datetime-local` input or computing its `min`
 * attribute.
 */
export function utcToIstLocal(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  // Use UTC getters on the shifted instant so we read IST wall-clock fields
  // regardless of the runtime's local timezone.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`
       + `T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}
