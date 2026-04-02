import { describe, it, expect } from "vitest";
import { formatAsTable, formatAsCsv, formatAsIds } from "../../src/utils/smart-filters.js";

const sampleRecords = [
  { id: 1, name: "Alpha GmbH", ort: "Berlin", betrag: "100.50" },
  { id: 2, name: "Beta AG", ort: "München", betrag: "250.00" },
  { id: 3, name: "Gamma KG", ort: "Hamburg", betrag: "50.75" },
];

describe("formatAsTable", () => {
  it("formats records as a readable table with all fields", () => {
    const result = formatAsTable(sampleRecords);
    const lines = result.split("\n");
    // Header line
    expect(lines[0]).toBe("id | name | ort | betrag");
    // Separator line
    expect(lines[1]).toContain("-|-");
    // Data rows
    expect(lines).toHaveLength(5); // header + separator + 3 rows
    expect(lines[2]).toBe("1 | Alpha GmbH | Berlin | 100.50");
    expect(lines[3]).toBe("2 | Beta AG | München | 250.00");
    expect(lines[4]).toBe("3 | Gamma KG | Hamburg | 50.75");
  });

  it("formats only specified fields", () => {
    const result = formatAsTable(sampleRecords, ["id", "name"]);
    const lines = result.split("\n");
    expect(lines[0]).toBe("id | name");
    expect(lines[2]).toBe("1 | Alpha GmbH");
  });

  it("returns placeholder for empty array", () => {
    expect(formatAsTable([])).toBe("(keine Ergebnisse)");
  });

  it("handles null/undefined values gracefully", () => {
    const records = [{ id: 1, name: null }, { id: 2, name: undefined }];
    const result = formatAsTable(records);
    const lines = result.split("\n");
    expect(lines[2]).toBe("1 | ");
    expect(lines[3]).toBe("2 | ");
  });
});

describe("formatAsCsv", () => {
  it("formats records as semicolon-separated CSV with all fields", () => {
    const result = formatAsCsv(sampleRecords);
    const lines = result.split("\n");
    expect(lines[0]).toBe("id;name;ort;betrag");
    expect(lines[1]).toBe("1;Alpha GmbH;Berlin;100.50");
    expect(lines[2]).toBe("2;Beta AG;München;250.00");
    expect(lines[3]).toBe("3;Gamma KG;Hamburg;50.75");
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it("formats only specified fields", () => {
    const result = formatAsCsv(sampleRecords, ["id", "betrag"]);
    const lines = result.split("\n");
    expect(lines[0]).toBe("id;betrag");
    expect(lines[1]).toBe("1;100.50");
  });

  it("returns empty string for empty array", () => {
    expect(formatAsCsv([])).toBe("");
  });

  it("quotes values containing semicolons", () => {
    const records = [{ id: 1, name: "Test; GmbH" }];
    const result = formatAsCsv(records);
    const lines = result.split("\n");
    expect(lines[1]).toBe('1;"Test; GmbH"');
  });

  it("escapes double quotes inside values", () => {
    const records = [{ id: 1, name: 'He said "hello"' }];
    const result = formatAsCsv(records);
    const lines = result.split("\n");
    expect(lines[1]).toBe('1;"He said ""hello"""');
  });

  it("handles null/undefined values gracefully", () => {
    const records = [{ id: 1, name: null }];
    const result = formatAsCsv(records);
    const lines = result.split("\n");
    expect(lines[1]).toBe("1;");
  });
});

describe("formatAsIds", () => {
  it("extracts comma-separated IDs", () => {
    expect(formatAsIds(sampleRecords)).toBe("1,2,3");
  });

  it("skips records without id", () => {
    const records = [{ id: 1 }, { name: "no-id" }, { id: 3 }];
    expect(formatAsIds(records)).toBe("1,3");
  });

  it("returns empty string for empty array", () => {
    expect(formatAsIds([])).toBe("");
  });

  it("handles id=0 as falsy (skipped)", () => {
    const records = [{ id: 0 }, { id: 1 }];
    expect(formatAsIds(records)).toBe("1");
  });
});
