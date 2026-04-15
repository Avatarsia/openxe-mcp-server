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
