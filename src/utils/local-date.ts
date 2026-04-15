/**
 * Format a Date as YYYY-MM-DD using LOCAL year/month/day, not UTC.
 *
 * Use this for **business-day strings** sent to OpenXE (datum fields,
 * period boundaries, faelligkeitsdaten). OpenXE expects calendar days
 * in the user's local TZ.
 *
 * Do NOT use for log timestamps or audit trails — use `toISOString()` there.
 */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date at LOCAL midnight (not UTC).
 *
 * Use this for OpenXE business-day strings (datum, lieferdatum, etc.)
 * before doing setDate/getDate/getMonth arithmetic. `new Date(str)` parses
 * the string as UTC midnight, which under negative-offset timezones
 * (e.g. America/New_York) lands on the previous local calendar day —
 * silently breaking aging buckets, faelligkeiten, and group-by-quartal.
 *
 * Inverse of `localDateString`. Use those two together for round-tripping.
 *
 * Garbage input (e.g. empty string, malformed date) returns an Invalid Date
 * (`getTime()` is NaN). Callers are responsible for passing well-formed
 * YYYY-MM-DD strings — typically from OpenXE responses where the field
 * shape is contractual.
 *
 * The defensive `slice(0, 10)` accepts naive ISO datetimes (e.g.
 * "2026-04-01T12:00:00") by ignoring the time component. It does NOT respect
 * a timezone suffix like "Z" or "+02:00" — feeding such inputs is a logic
 * bug at the caller, not this helper's job to handle.
 */
export function parseLocalDate(s: string): Date {
  const parts = s.slice(0, 10).split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return new Date(y, m - 1, d);
}
