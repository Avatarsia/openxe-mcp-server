import { describe, it, expect } from "vitest";
import { filterDeleted } from "../../src/utils/field-filter.js";

describe("filterDeleted", () => {
  it("filters out records with geloescht=1 (number)", () => {
    const records = [
      { id: 1, name: "Active", geloescht: 0 },
      { id: 2, name: "Deleted", geloescht: 1 },
    ];
    const result = filterDeleted(records);
    expect(result).toEqual([{ id: 1, name: "Active", geloescht: 0 }]);
  });

  it("filters out records with geloescht='1' (string)", () => {
    const records = [
      { id: 1, name: "Active", geloescht: "0" },
      { id: 2, name: "Deleted", geloescht: "1" },
    ];
    const result = filterDeleted(records);
    expect(result).toEqual([{ id: 1, name: "Active", geloescht: "0" }]);
  });

  it("filters out records with kundennummer starting with 'DEL-'", () => {
    const records = [
      { id: 1, name: "Good", kundennummer: "KD-1001" },
      { id: 2, name: "Deleted", kundennummer: "DEL-1002" },
    ];
    const result = filterDeleted(records);
    expect(result).toEqual([{ id: 1, name: "Good", kundennummer: "KD-1001" }]);
  });

  it("filters out records with belegnr starting with 'DEL'", () => {
    const records = [
      { id: 1, name: "Order", belegnr: "AU-2026-0001" },
      { id: 2, name: "Deleted", belegnr: "DEL-AU-2026-0002" },
    ];
    const result = filterDeleted(records);
    expect(result).toEqual([{ id: 1, name: "Order", belegnr: "AU-2026-0001" }]);
  });

  it("filters out empty ghost records (no name, no kundennummer, no belegnr)", () => {
    const records = [
      { id: 1, name: "Real" },
      { id: 2 },
      { id: 3, name: "", kundennummer: "", belegnr: "" },
    ];
    const result = filterDeleted(records);
    expect(result).toEqual([{ id: 1, name: "Real" }]);
  });

  it("keeps normal records", () => {
    const records = [
      { id: 1, name: "Customer A", kundennummer: "KD-1001", geloescht: 0 },
      { id: 2, name: "Customer B", kundennummer: "KD-1002", geloescht: "0" },
    ];
    const result = filterDeleted(records);
    expect(result).toHaveLength(2);
  });

  it("keeps records with geloescht=0", () => {
    const records = [
      { id: 1, name: "Active", geloescht: 0 },
      { id: 2, name: "Also Active", geloescht: "0" },
    ];
    const result = filterDeleted(records);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterDeleted([])).toEqual([]);
  });
});
