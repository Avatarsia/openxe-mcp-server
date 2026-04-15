import { parseLocalDate, localDateString } from "./local-date.js";

/** Default payment term (Tage) when invoice.zahlungszieltage is missing or non-numeric. */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

/** Minimal invoice shape used by aging helpers. */
export type Agingable = {
  datum?: string | null;
  zahlungszieltage?: number | string | null;
};

const TODAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Compute an invoice's due date (Faelligkeit) as YYYY-MM-DD.
 *
 * Invoice.datum (YYYY-MM-DD) plus invoice.zahlungszieltage, defaulting to
 * DEFAULT_PAYMENT_TERM_DAYS when the field is missing or non-numeric. Matches
 * the formula used by handleOpenItemsReport so KPIs, presets, and reports agree.
 *
 * Negative zahlungszieltage are clamped to 0 (treated as "sofort faellig").
 * OpenXE is not expected to emit negative terms; this is defensive.
 */
export function invoiceDueDate(
  datum: string,
  zahlungszieltage?: number | string | null
): string {
  const parsed = typeof zahlungszieltage === "string"
    ? parseInt(zahlungszieltage, 10)
    : (zahlungszieltage ?? Number.NaN);
  const days = Number.isFinite(parsed) ? (parsed as number) : DEFAULT_PAYMENT_TERM_DAYS;
  const clamped = Math.max(0, days);
  const d = parseLocalDate(datum);
  d.setDate(d.getDate() + clamped);
  return localDateString(d);
}

/**
 * Days past the invoice's due date (0 if not yet overdue).
 *
 * `today` must be a zero-padded YYYY-MM-DD string (throws RangeError otherwise).
 * Typical source: `localDateString(new Date())`.
 *
 * Compares calendar days, not timestamps, so an invoice that becomes due today
 * isn't flagged as overdue until tomorrow.
 */
export function invoiceOverdueDays(
  invoice: Agingable,
  today: string
): number {
  if (!TODAY_SHAPE.test(today)) {
    throw new RangeError(
      `invoiceOverdueDays: "today" must be YYYY-MM-DD, got ${JSON.stringify(today)}`
    );
  }
  if (!invoice.datum) return 0;
  const due = invoiceDueDate(invoice.datum, invoice.zahlungszieltage);
  if (today <= due) return 0;
  // Parse both as UTC midnight — offset cancels, ms-delta gives full calendar days.
  const ms = Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z");
  return Math.round(ms / 86400000);
}

/**
 * Convenience: is the invoice past its due date on `today`?
 *
 * `today` must be a zero-padded YYYY-MM-DD string (throws RangeError otherwise).
 */
export function isInvoiceOverdue(
  invoice: Agingable,
  today: string
): boolean {
  return invoiceOverdueDays(invoice, today) > 0;
}
