import { describe, it, expect } from "vitest";
import {
  invoiceDueDate,
  invoiceOverdueDays,
  isInvoiceOverdue,
} from "../../src/utils/invoice-aging.js";

describe("invoiceDueDate", () => {
  it("adds numeric zahlungszieltage to datum", () => {
    expect(invoiceDueDate("2026-03-01", 60)).toBe("2026-04-30");
  });

  it("defaults to 30 days when zahlungszieltage is missing (null/undefined)", () => {
    expect(invoiceDueDate("2026-03-01", null)).toBe("2026-03-31");
    expect(invoiceDueDate("2026-03-01", undefined)).toBe("2026-03-31");
  });

  it("parses string zahlungszieltage", () => {
    expect(invoiceDueDate("2026-03-01", "60")).toBe("2026-04-30");
  });

  it("defaults to 30 when string is not parseable", () => {
    expect(invoiceDueDate("2026-03-01", "abc")).toBe("2026-03-31");
  });

  it("handles month overflow across year boundary", () => {
    expect(invoiceDueDate("2025-12-15", 30)).toBe("2026-01-14");
  });

  it("handles zero payment term", () => {
    expect(invoiceDueDate("2026-03-01", 0)).toBe("2026-03-01");
  });
});

describe("invoiceOverdueDays", () => {
  it("returns 0 when today is before the due date", () => {
    expect(
      invoiceOverdueDays({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-04-15")
    ).toBe(0);
  });

  it("returns 0 when today equals the due date (not yet overdue)", () => {
    // due date is exactly today -> grace day, not overdue until tomorrow
    expect(
      invoiceOverdueDays({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-04-30")
    ).toBe(0);
  });

  it("returns positive overdue days when past the due date", () => {
    expect(
      invoiceOverdueDays({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-05-05")
    ).toBe(5);
  });

  it("returns 0 when datum is missing", () => {
    expect(invoiceOverdueDays({}, "2026-05-05")).toBe(0);
    expect(invoiceOverdueDays({ datum: null }, "2026-05-05")).toBe(0);
  });

  it("defaults to 30-day term when zahlungszieltage is missing", () => {
    // datum 2026-03-01 + 30 = 2026-03-31; today 2026-04-10 -> 10 days overdue
    expect(invoiceOverdueDays({ datum: "2026-03-01" }, "2026-04-10")).toBe(10);
  });

  it("throws RangeError on malformed today", () => {
    expect(() => invoiceOverdueDays({ datum: "2026-03-01" }, "")).toThrow(RangeError);
    expect(() => invoiceOverdueDays({ datum: "2026-03-01" }, "2026-4-10")).toThrow(RangeError);
  });
});

describe("isInvoiceOverdue", () => {
  it("false before due date", () => {
    expect(
      isInvoiceOverdue({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-04-15")
    ).toBe(false);
  });

  it("true after due date", () => {
    expect(
      isInvoiceOverdue({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-05-05")
    ).toBe(true);
  });

  it("false exactly on the due date (calendar-day boundary)", () => {
    expect(
      isInvoiceOverdue({ datum: "2026-03-01", zahlungszieltage: 60 }, "2026-04-30")
    ).toBe(false);
  });
});
