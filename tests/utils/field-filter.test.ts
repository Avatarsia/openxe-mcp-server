import { describe, it, expect } from "vitest";
import { pickFields, applySlimMode, truncateWithWarning, SLIM_FIELDS, MAX_LIST_RESULTS } from "../../src/utils/field-filter.js";

describe("pickFields", () => {
  it("picks only the requested fields from a record", () => {
    const record = { id: 1, name: "Alice", email: "a@b.com", secret: "x" };
    expect(pickFields(record, ["id", "name"])).toEqual({ id: 1, name: "Alice" });
  });

  it("ignores fields that do not exist in the record", () => {
    const record = { id: 1, name: "Bob" };
    expect(pickFields(record, ["id", "missing"])).toEqual({ id: 1 });
  });

  it("returns empty object when no fields match", () => {
    expect(pickFields({ a: 1 }, ["b", "c"])).toEqual({});
  });

  it("returns empty object for empty fields array", () => {
    expect(pickFields({ a: 1 }, [])).toEqual({});
  });

  it("preserves falsy values like 0, null, empty string", () => {
    const record = { a: 0, b: null, c: "", d: false };
    expect(pickFields(record, ["a", "b", "c", "d"])).toEqual({ a: 0, b: null, c: "", d: false });
  });
});

describe("applySlimMode", () => {
  it("returns data unchanged when fields is undefined", () => {
    const data = [{ id: 1, name: "A", extra: "x" }];
    expect(applySlimMode(data, undefined)).toBe(data);
  });

  it("filters fields on an array of records", () => {
    const data = [
      { id: 1, name: "A", extra: "x" },
      { id: 2, name: "B", extra: "y" },
    ];
    expect(applySlimMode(data, ["id", "name"])).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });

  it("filters fields on a single object", () => {
    const data = { id: 1, name: "A", extra: "x" };
    expect(applySlimMode(data, ["id", "name"])).toEqual({ id: 1, name: "A" });
  });

  it("returns primitive values unchanged even with fields", () => {
    expect(applySlimMode("hello", ["id"])).toBe("hello");
    expect(applySlimMode(42, ["id"])).toBe(42);
    expect(applySlimMode(null, ["id"])).toBeNull();
  });
});

describe("truncateWithWarning", () => {
  it("returns all data when under the limit", () => {
    const data = [1, 2, 3];
    const result = truncateWithWarning(data, 5);
    expect(result).toEqual({ data: [1, 2, 3], truncated: false, total: 3 });
  });

  it("returns all data when exactly at the limit", () => {
    const data = [1, 2, 3];
    const result = truncateWithWarning(data, 3);
    expect(result).toEqual({ data: [1, 2, 3], truncated: false, total: 3 });
  });

  it("truncates data exceeding the limit", () => {
    const data = [1, 2, 3, 4, 5];
    const result = truncateWithWarning(data, 3);
    expect(result).toEqual({ data: [1, 2, 3], truncated: true, total: 5 });
  });

  it("handles empty array", () => {
    const result = truncateWithWarning([], 10);
    expect(result).toEqual({ data: [], truncated: false, total: 0 });
  });
});

describe("constants", () => {
  it("exports SLIM_FIELDS with expected entity keys", () => {
    const keys = Object.keys(SLIM_FIELDS);
    expect(keys).toContain("address");
    expect(keys).toContain("article");
    expect(keys).toContain("order");
    expect(keys).toContain("invoice");
  });

  it("every SLIM_FIELDS entry includes id", () => {
    for (const [, fields] of Object.entries(SLIM_FIELDS)) {
      expect(fields).toContain("id");
    }
  });

  it("MAX_LIST_RESULTS is 50", () => {
    expect(MAX_LIST_RESULTS).toBe(50);
  });
});
