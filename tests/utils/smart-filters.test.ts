import { describe, it, expect, vi, afterEach } from "vitest";
import { applyWhere, applySort, applyLimit, pickFields, applyFields, parseZeitraum, WhereClause } from "../../src/utils/smart-filters.js";

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
