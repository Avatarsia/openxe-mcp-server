import { describe, it, expect } from "vitest";
import { parseLocalDate, localDateString } from "../../src/utils/local-date.js";

describe("parseLocalDate — garbage input pinning", () => {
  it("returns Invalid Date (NaN time) for empty string", () => {
    const d = parseLocalDate("");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it("returns Invalid Date (NaN time) for malformed input", () => {
    const d = parseLocalDate("abc");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it("returns Invalid Date (NaN time) for year-only input", () => {
    const d = parseLocalDate("2026");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });
});

describe("parseLocalDate — valid input", () => {
  it("parses YYYY-MM-DD to local midnight", () => {
    const d = parseLocalDate("2026-04-10");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips with localDateString", () => {
    const s = "2026-04-10";
    expect(localDateString(parseLocalDate(s))).toBe(s);
  });

  it("ignores trailing time component (naive ISO)", () => {
    const d = parseLocalDate("2026-04-01T12:00:00");
    expect(localDateString(d)).toBe("2026-04-01");
  });
});
