import { describe, it, expect, vi, afterEach } from "vitest";
import { applyWhere, applySort, applyLimit, pickFields, applyFields, parseZeitraum, applyAggregate, applyStatusPreset, STATUS_PRESETS, WhereClause, AggregateOp } from "../../src/utils/smart-filters.js";

const sampleRecords = [
  { id: 1, name: "Alpha GmbH", city: "Berlin", amount: "100.50", status: "active", email: "alpha@test.de" },
  { id: 2, name: "Beta AG", city: "München", amount: "250.00", status: "inactive", email: "" },
  { id: 3, name: "Gamma KG", city: "Berlin", amount: "50.75", status: "active", email: "gamma@test.de" },
  { id: 4, name: "Delta OHG", city: "Hamburg", amount: "999.99", status: "active", email: "delta@example.com" },
  { id: 5, name: "Epsilon GmbH", city: "Frankfurt", amount: "0.00", status: "inactive", email: "" },
];

describe("applyWhere", () => {
  // --- equals ---
  it("equals: filters by exact string match", () => {
    const result = applyWhere(sampleRecords, { city: { equals: "Berlin" } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  it("equals: filters by numeric value as string comparison", () => {
    const result = applyWhere(sampleRecords, { id: { equals: 4 } });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Delta OHG");
  });

  // --- contains ---
  it("contains: case-insensitive substring match", () => {
    const result = applyWhere(sampleRecords, { name: { contains: "gmbh" } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([1, 5]);
  });

  it("contains: returns empty when no match", () => {
    const result = applyWhere(sampleRecords, { name: { contains: "zzz" } });
    expect(result).toHaveLength(0);
  });

  // --- startsWith ---
  it("startsWith: matches field prefix", () => {
    const result = applyWhere(sampleRecords, { name: { startsWith: "Alpha" } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("startsWith: is case-sensitive", () => {
    const result = applyWhere(sampleRecords, { name: { startsWith: "alpha" } });
    expect(result).toHaveLength(0);
  });

  // --- endsWith ---
  it("endsWith: matches field suffix", () => {
    const result = applyWhere(sampleRecords, { email: { endsWith: "test.de" } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  // --- gt ---
  it("gt: filters values greater than threshold", () => {
    const result = applyWhere(sampleRecords, { amount: { gt: 200 } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([2, 4]);
  });

  // --- lt ---
  it("lt: filters values less than threshold", () => {
    const result = applyWhere(sampleRecords, { amount: { lt: 100 } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([3, 5]);
  });

  // --- gte ---
  it("gte: filters values greater than or equal to threshold", () => {
    const result = applyWhere(sampleRecords, { amount: { gte: 100.50 } });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual([1, 2, 4]);
  });

  // --- lte ---
  it("lte: filters values less than or equal to threshold", () => {
    const result = applyWhere(sampleRecords, { amount: { lte: 50.75 } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([3, 5]);
  });

  // --- range ---
  it("range: filters values within string range (inclusive)", () => {
    const records = [
      { id: 1, date: "2024-01-15" },
      { id: 2, date: "2024-03-01" },
      { id: 3, date: "2024-06-20" },
      { id: 4, date: "2024-12-31" },
    ];
    const result = applyWhere(records, { date: { range: ["2024-02-01", "2024-07-01"] } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([2, 3]);
  });

  // --- empty ---
  it("empty: true matches empty fields", () => {
    const result = applyWhere(sampleRecords, { email: { empty: true } });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([2, 5]);
  });

  it("empty: false matches non-empty fields", () => {
    const result = applyWhere(sampleRecords, { email: { empty: false } });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual([1, 3, 4]);
  });

  // --- notEmpty ---
  it("notEmpty: true matches only non-empty fields", () => {
    const result = applyWhere(sampleRecords, { email: { notEmpty: true } });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual([1, 3, 4]);
  });

  // --- combined conditions ---
  it("combines multiple conditions on same field (AND logic)", () => {
    const result = applyWhere(sampleRecords, { amount: { gte: 50, lte: 250 } });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it("combines conditions across multiple fields (AND logic)", () => {
    const result = applyWhere(sampleRecords, {
      city: { equals: "Berlin" },
      status: { equals: "active" },
    });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  // --- handles missing fields gracefully ---
  it("treats missing fields as empty string", () => {
    const result = applyWhere(sampleRecords, { nonexistent: { empty: true } });
    expect(result).toHaveLength(5);
  });
});

describe("applySort", () => {
  it("sorts ascending by string field (default)", () => {
    const result = applySort(sampleRecords, { field: "name" });
    expect(result.map(r => r.name)).toEqual([
      "Alpha GmbH", "Beta AG", "Delta OHG", "Epsilon GmbH", "Gamma KG"
    ]);
  });

  it("sorts descending by string field", () => {
    const result = applySort(sampleRecords, { field: "name", order: "desc" });
    expect(result.map(r => r.name)).toEqual([
      "Gamma KG", "Epsilon GmbH", "Delta OHG", "Beta AG", "Alpha GmbH"
    ]);
  });

  it("sorts ascending by numeric field", () => {
    const result = applySort(sampleRecords, { field: "amount" });
    expect(result.map(r => r.amount)).toEqual(["0.00", "50.75", "100.50", "250.00", "999.99"]);
  });

  it("sorts descending by numeric field", () => {
    const result = applySort(sampleRecords, { field: "amount", order: "desc" });
    expect(result.map(r => r.amount)).toEqual(["999.99", "250.00", "100.50", "50.75", "0.00"]);
  });

  it("does not mutate the original array", () => {
    const original = [...sampleRecords];
    applySort(sampleRecords, { field: "amount", order: "desc" });
    expect(sampleRecords).toEqual(original);
  });
});

describe("applyLimit", () => {
  it("returns first N records", () => {
    const result = applyLimit(sampleRecords, 3);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it("returns all records when limit exceeds length", () => {
    const result = applyLimit(sampleRecords, 100);
    expect(result).toHaveLength(5);
  });
});

describe("pickFields", () => {
  it("picks only specified fields from a record", () => {
    const result = pickFields(sampleRecords[0], ["id", "name"]);
    expect(result).toEqual({ id: 1, name: "Alpha GmbH" });
  });

  it("ignores fields not present in the record", () => {
    const result = pickFields(sampleRecords[0], ["id", "nonexistent"]);
    expect(result).toEqual({ id: 1 });
  });
});

describe("applyFields", () => {
  it("projects specified fields across all records", () => {
    const result = applyFields(sampleRecords, ["id", "city"]);
    expect(result).toEqual([
      { id: 1, city: "Berlin" },
      { id: 2, city: "München" },
      { id: 3, city: "Berlin" },
      { id: 4, city: "Hamburg" },
      { id: 5, city: "Frankfurt" },
    ]);
  });
});

// --- parseZeitraum tests ---

describe("parseZeitraum", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function withFakeDate(isoDate: string, fn: () => void) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate + "T12:00:00Z"));
    fn();
  }

  it("heute: returns today's date for both von and bis", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("heute");
      expect(result).toEqual({ von: "2025-10-15", bis: "2025-10-15" });
    });
  });

  it("diese-woche: returns Monday to Sunday of current week", () => {
    // 2025-10-15 is a Wednesday
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("diese-woche");
      expect(result).toEqual({ von: "2025-10-13", bis: "2025-10-19" });
    });
  });

  it("diese-woche: works when today is Monday", () => {
    // 2025-10-13 is a Monday
    withFakeDate("2025-10-13", () => {
      const result = parseZeitraum("diese-woche");
      expect(result).toEqual({ von: "2025-10-13", bis: "2025-10-19" });
    });
  });

  it("diese-woche: works when today is Sunday", () => {
    // 2025-10-19 is a Sunday
    withFakeDate("2025-10-19", () => {
      const result = parseZeitraum("diese-woche");
      expect(result).toEqual({ von: "2025-10-13", bis: "2025-10-19" });
    });
  });

  it("dieser-monat: returns first and last day of current month", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("dieser-monat");
      expect(result).toEqual({ von: "2025-10-01", bis: "2025-10-31" });
    });
  });

  it("dieser-monat: handles February (non-leap year)", () => {
    withFakeDate("2025-02-10", () => {
      const result = parseZeitraum("dieser-monat");
      expect(result).toEqual({ von: "2025-02-01", bis: "2025-02-28" });
    });
  });

  it("dieser-monat: handles February (leap year)", () => {
    withFakeDate("2024-02-10", () => {
      const result = parseZeitraum("dieser-monat");
      expect(result).toEqual({ von: "2024-02-01", bis: "2024-02-29" });
    });
  });

  it("letzter-monat: returns first and last day of previous month", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("letzter-monat");
      expect(result).toEqual({ von: "2025-09-01", bis: "2025-09-30" });
    });
  });

  it("letzter-monat: handles January (wraps to previous year December)", () => {
    withFakeDate("2025-01-15", () => {
      const result = parseZeitraum("letzter-monat");
      expect(result).toEqual({ von: "2024-12-01", bis: "2024-12-31" });
    });
  });

  it("letzte-7-tage: returns 7 days ago to today", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("letzte-7-tage");
      expect(result).toEqual({ von: "2025-10-08", bis: "2025-10-15" });
    });
  });

  it("letzte-30-tage: returns 30 days ago to today", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("letzte-30-tage");
      expect(result).toEqual({ von: "2025-09-15", bis: "2025-10-15" });
    });
  });

  it("letzte-90-tage: returns 90 days ago to today", () => {
    withFakeDate("2025-10-15", () => {
      const result = parseZeitraum("letzte-90-tage");
      expect(result).toEqual({ von: "2025-07-17", bis: "2025-10-15" });
    });
  });

  // --- Named month formats ---

  it("oktober-2025: returns October 2025 range", () => {
    const result = parseZeitraum("oktober-2025");
    expect(result).toEqual({ von: "2025-10-01", bis: "2025-10-31" });
  });

  it("februar-2024: returns February 2024 (leap year)", () => {
    const result = parseZeitraum("februar-2024");
    expect(result).toEqual({ von: "2024-02-01", bis: "2024-02-29" });
  });

  it("januar-2025: returns January 2025", () => {
    const result = parseZeitraum("januar-2025");
    expect(result).toEqual({ von: "2025-01-01", bis: "2025-01-31" });
  });

  it("dezember-2025: returns December 2025", () => {
    const result = parseZeitraum("dezember-2025");
    expect(result).toEqual({ von: "2025-12-01", bis: "2025-12-31" });
  });

  it("month-year is case-insensitive", () => {
    const result = parseZeitraum("Oktober-2025");
    expect(result).toEqual({ von: "2025-10-01", bis: "2025-10-31" });
  });

  // --- Quarter formats ---

  it("Q1-2025: returns Jan-Mar 2025", () => {
    const result = parseZeitraum("Q1-2025");
    expect(result).toEqual({ von: "2025-01-01", bis: "2025-03-31" });
  });

  it("Q2-2025: returns Apr-Jun 2025", () => {
    const result = parseZeitraum("Q2-2025");
    expect(result).toEqual({ von: "2025-04-01", bis: "2025-06-30" });
  });

  it("Q3-2025: returns Jul-Sep 2025", () => {
    const result = parseZeitraum("Q3-2025");
    expect(result).toEqual({ von: "2025-07-01", bis: "2025-09-30" });
  });

  it("Q4-2025: returns Oct-Dec 2025", () => {
    const result = parseZeitraum("Q4-2025");
    expect(result).toEqual({ von: "2025-10-01", bis: "2025-12-31" });
  });

  it("quarter is case-insensitive", () => {
    const result = parseZeitraum("q3-2025");
    expect(result).toEqual({ von: "2025-07-01", bis: "2025-09-30" });
  });

  // --- Full year ---

  it("2025: returns full year range", () => {
    const result = parseZeitraum("2025");
    expect(result).toEqual({ von: "2025-01-01", bis: "2025-12-31" });
  });

  it("2024: returns full year range", () => {
    const result = parseZeitraum("2024");
    expect(result).toEqual({ von: "2024-01-01", bis: "2024-12-31" });
  });

  // --- Error handling ---

  it("throws for unknown zeitraum string", () => {
    expect(() => parseZeitraum("gibberish")).toThrow("Unbekannter Zeitraum: gibberish");
  });

  it("throws for invalid quarter number", () => {
    expect(() => parseZeitraum("Q5-2025")).toThrow("Unbekannter Zeitraum");
  });

  it("throws for empty string", () => {
    expect(() => parseZeitraum("")).toThrow("Unbekannter Zeitraum");
  });
});

// --- applyAggregate tests ---

describe("applyAggregate", () => {
  const invoiceRecords = [
    { id: 1, belegnr: "RE-001", soll: "100.50", status: "bezahlt", land: "DE" },
    { id: 2, belegnr: "RE-002", soll: "250.00", status: "offen", land: "AT" },
    { id: 3, belegnr: "RE-003", soll: "50.75", status: "bezahlt", land: "DE" },
    { id: 4, belegnr: "RE-004", soll: "999.99", status: "offen", land: "DE" },
    { id: 5, belegnr: "RE-005", soll: "0.00", status: "storniert", land: "AT" },
  ];

  // --- count ---
  it("count: returns total number of records", () => {
    const result = applyAggregate(invoiceRecords, "count");
    expect(result).toEqual({ count: 5 });
  });

  it("count: returns 0 for empty array", () => {
    const result = applyAggregate([], "count");
    expect(result).toEqual({ count: 0 });
  });

  // --- sum ---
  it("sum: sums a numeric field across all records", () => {
    const result = applyAggregate(invoiceRecords, { sum: "soll" });
    expect(result).toEqual({ sum: 1401.24, field: "soll", count: 5 });
  });

  it("sum: returns 0 for empty array", () => {
    const result = applyAggregate([], { sum: "soll" });
    expect(result).toEqual({ sum: 0, field: "soll", count: 0 });
  });

  it("sum: handles non-numeric values as 0", () => {
    const records = [
      { id: 1, val: "abc" },
      { id: 2, val: "10.50" },
    ];
    const result = applyAggregate(records, { sum: "val" });
    expect(result).toEqual({ sum: 10.5, field: "val", count: 2 });
  });

  it("sum: rounds to 2 decimal places", () => {
    const records = [
      { id: 1, val: "0.1" },
      { id: 2, val: "0.2" },
    ];
    const result = applyAggregate(records, { sum: "val" });
    expect(result.sum).toBe(0.3);
  });

  // --- avg ---
  it("avg: calculates average of a numeric field", () => {
    const result = applyAggregate(invoiceRecords, { avg: "soll" });
    expect(result).toEqual({ avg: 280.25, field: "soll", count: 5 });
  });

  it("avg: returns 0 for empty array", () => {
    const result = applyAggregate([], { avg: "soll" });
    expect(result).toEqual({ avg: 0, field: "soll", count: 0 });
  });

  it("avg: rounds to 2 decimal places", () => {
    const records = [
      { id: 1, val: "10" },
      { id: 2, val: "20" },
      { id: 3, val: "30" },
    ];
    const result = applyAggregate(records, { avg: "val" });
    expect(result.avg).toBe(20);
  });

  // --- min ---
  it("min: finds the minimum value of a numeric field", () => {
    const result = applyAggregate(invoiceRecords, { min: "soll" });
    expect(result).toEqual({ min: 0, field: "soll" });
  });

  it("min: works with positive-only values", () => {
    const records = [
      { id: 1, val: "42.5" },
      { id: 2, val: "7.3" },
      { id: 3, val: "100" },
    ];
    const result = applyAggregate(records, { min: "val" });
    expect(result.min).toBe(7.3);
  });

  // --- max ---
  it("max: finds the maximum value of a numeric field", () => {
    const result = applyAggregate(invoiceRecords, { max: "soll" });
    expect(result).toEqual({ max: 999.99, field: "soll" });
  });

  it("max: works with a single record", () => {
    const records = [{ id: 1, val: "55.5" }];
    const result = applyAggregate(records, { max: "val" });
    expect(result.max).toBe(55.5);
  });

  // --- groupBy ---
  it("groupBy: groups records by field with count", () => {
    const result = applyAggregate(invoiceRecords, { groupBy: "status" });
    expect(result.groupBy).toBe("status");
    expect(result.groups.bezahlt.count).toBe(2);
    expect(result.groups.offen.count).toBe(2);
    expect(result.groups.storniert.count).toBe(1);
    // No sum key when sum is not specified
    expect(result.groups.bezahlt.sum).toBeUndefined();
  });

  it("groupBy: groups with sum aggregation", () => {
    const result = applyAggregate(invoiceRecords, { groupBy: "status", sum: "soll" });
    expect(result.groupBy).toBe("status");
    expect(result.groups.bezahlt).toEqual({ count: 2, sum: 151.25 });
    expect(result.groups.offen).toEqual({ count: 2, sum: 1249.99 });
    expect(result.groups.storniert).toEqual({ count: 1, sum: 0 });
  });

  it("groupBy: groups by land", () => {
    const result = applyAggregate(invoiceRecords, { groupBy: "land", sum: "soll" });
    expect(result.groups.DE).toEqual({ count: 3, sum: 1151.24 });
    expect(result.groups.AT).toEqual({ count: 2, sum: 250 });
  });

  it("groupBy: uses '(leer)' for empty/missing group keys", () => {
    const records = [
      { id: 1, cat: "A", val: "10" },
      { id: 2, cat: "", val: "20" },
      { id: 3, val: "30" },
    ];
    const result = applyAggregate(records, { groupBy: "cat" });
    expect(result.groups.A.count).toBe(1);
    expect(result.groups["(leer)"].count).toBe(2);
  });

  it("groupBy: rounds sums to 2 decimal places", () => {
    const records = [
      { id: 1, cat: "X", val: "0.1" },
      { id: 2, cat: "X", val: "0.2" },
    ];
    const result = applyAggregate(records, { groupBy: "cat", sum: "val" });
    expect(result.groups.X.sum).toBe(0.3);
  });

  // --- unknown op ---
  it("returns error for unknown aggregate operation", () => {
    const result = applyAggregate(invoiceRecords, { unknown: "field" } as any);
    expect(result).toEqual({ error: "Unknown aggregate operation" });
  });
});

// --- STATUS_PRESETS & applyStatusPreset tests ---

describe("STATUS_PRESETS", () => {
  it("has presets for orders, invoices, and quotes", () => {
    expect(STATUS_PRESETS).toHaveProperty("orders");
    expect(STATUS_PRESETS).toHaveProperty("invoices");
    expect(STATUS_PRESETS).toHaveProperty("quotes");
  });

  it("orders.offen matches only freigegeben", () => {
    const fn = STATUS_PRESETS.orders["offen"];
    expect(fn({ status: "freigegeben" })).toBe(true);
    expect(fn({ status: "abgeschlossen" })).toBe(false);
    expect(fn({ status: "angelegt" })).toBe(false);
  });

  it("orders.entwurf matches angelegt or missing belegnr", () => {
    const fn = STATUS_PRESETS.orders["entwurf"];
    expect(fn({ status: "angelegt", belegnr: "AU-001" })).toBe(true);
    expect(fn({ status: "freigegeben", belegnr: "" })).toBe(true);
    expect(fn({ status: "freigegeben", belegnr: "AU-001" })).toBe(false);
  });

  it("invoices.offen excludes bezahlt", () => {
    const fn = STATUS_PRESETS.invoices["offen"];
    expect(fn({ zahlungsstatus: "offen" })).toBe(true);
    expect(fn({ zahlungsstatus: "bezahlt" })).toBe(false);
  });

  it("invoices.bezahlt matches only bezahlt", () => {
    const fn = STATUS_PRESETS.invoices["bezahlt"];
    expect(fn({ zahlungsstatus: "bezahlt" })).toBe(true);
    expect(fn({ zahlungsstatus: "offen" })).toBe(false);
  });

  it("invoices.ueberfaellig: paid invoices never overdue", () => {
    const fn = STATUS_PRESETS.invoices["ueberfaellig"];
    expect(fn({ zahlungsstatus: "bezahlt", datum: "2020-01-01" })).toBe(false);
  });

  it("invoices.ueberfaellig: unpaid older than 30 days is overdue", () => {
    const fn = STATUS_PRESETS.invoices["ueberfaellig"];
    const old = new Date();
    old.setDate(old.getDate() - 45);
    expect(fn({ zahlungsstatus: "offen", datum: old.toISOString().split("T")[0] })).toBe(true);
  });

  it("invoices.ueberfaellig: unpaid within 30 days is not overdue", () => {
    const fn = STATUS_PRESETS.invoices["ueberfaellig"];
    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    expect(fn({ zahlungsstatus: "offen", datum: recent.toISOString().split("T")[0] })).toBe(false);
  });

  it("invoices.entwurf matches records without belegnr or status angelegt", () => {
    const fn = STATUS_PRESETS.invoices["entwurf"];
    expect(fn({ belegnr: "", status: "freigegeben" })).toBe(true);
    expect(fn({ belegnr: null, status: "freigegeben" })).toBe(true);
    expect(fn({ belegnr: "RE-001", status: "angelegt" })).toBe(true);
    expect(fn({ belegnr: "RE-001", status: "freigegeben" })).toBe(false);
  });

  it("invoices.mahnkandidaten: paid never a candidate", () => {
    const fn = STATUS_PRESETS.invoices["mahnkandidaten"];
    expect(fn({ zahlungsstatus: "bezahlt", datum: "2020-01-01" })).toBe(false);
  });

  it("invoices.mahnkandidaten: gesperrt invoices excluded", () => {
    const fn = STATUS_PRESETS.invoices["mahnkandidaten"];
    const old = new Date();
    old.setDate(old.getDate() - 30);
    expect(fn({ zahlungsstatus: "offen", mahnwesen_gesperrt: "1", datum: old.toISOString().split("T")[0] })).toBe(false);
  });

  it("invoices.mahnkandidaten: unpaid, not locked, older than 14 days", () => {
    const fn = STATUS_PRESETS.invoices["mahnkandidaten"];
    const old = new Date();
    old.setDate(old.getDate() - 20);
    expect(fn({ zahlungsstatus: "offen", mahnwesen_gesperrt: "0", datum: old.toISOString().split("T")[0] })).toBe(true);
  });

  it("quotes.offen matches freigegeben and angelegt", () => {
    const fn = STATUS_PRESETS.quotes["offen"];
    expect(fn({ status: "freigegeben" })).toBe(true);
    expect(fn({ status: "angelegt" })).toBe(true);
    expect(fn({ status: "abgelehnt" })).toBe(false);
  });

  it("quotes.angenommen matches beauftragt", () => {
    const fn = STATUS_PRESETS.quotes["angenommen"];
    expect(fn({ status: "beauftragt" })).toBe(true);
    expect(fn({ status: "freigegeben" })).toBe(false);
  });

  it("quotes.abgelehnt matches abgelehnt", () => {
    const fn = STATUS_PRESETS.quotes["abgelehnt"];
    expect(fn({ status: "abgelehnt" })).toBe(true);
    expect(fn({ status: "angelegt" })).toBe(false);
  });
});

describe("applyStatusPreset", () => {
  const invoices = [
    { id: 1, zahlungsstatus: "offen" },
    { id: 2, zahlungsstatus: "bezahlt" },
    { id: 3, zahlungsstatus: "offen" },
  ];

  it("filters by known preset", () => {
    const result = applyStatusPreset(invoices, "invoices", "bezahlt");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("returns all records for unknown entity", () => {
    const result = applyStatusPreset(invoices, "unknown_entity", "offen");
    expect(result).toHaveLength(3);
  });

  it("returns all records for unknown preset", () => {
    const result = applyStatusPreset(invoices, "invoices", "nonexistent");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when all filtered out", () => {
    const allPaid = [{ id: 1, zahlungsstatus: "bezahlt" }, { id: 2, zahlungsstatus: "bezahlt" }];
    const result = applyStatusPreset(allPaid, "invoices", "offen");
    expect(result).toHaveLength(0);
  });

  it("works with orders entity", () => {
    const orders = [
      { id: 1, status: "freigegeben" },
      { id: 2, status: "abgeschlossen" },
      { id: 3, status: "angelegt" },
    ];
    const result = applyStatusPreset(orders, "orders", "offen");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("works with quotes entity", () => {
    const quotes = [
      { id: 1, status: "freigegeben" },
      { id: 2, status: "beauftragt" },
      { id: 3, status: "abgelehnt" },
    ];
    const result = applyStatusPreset(quotes, "quotes", "angenommen");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});
