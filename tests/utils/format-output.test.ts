import { describe, it, expect } from "vitest";
import { formatAsTable, formatAsCsv, formatAsIds, formatAsCsvPositions } from "../../src/utils/smart-filters.js";

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

  it("quotes values containing newlines (LF)", () => {
    // Multi-line text (e.g. article description) must be quoted so CSV
    // importers do not treat the embedded newline as a new row.
    const records = [{ id: 1, name: "Line 1\nLine 2" }];
    const result = formatAsCsv(records);
    // Entire CSV is one header line plus exactly one data row.
    expect(result).toBe('id;name\n1;"Line 1\nLine 2"');
  });

  it("quotes values containing carriage returns (CRLF)", () => {
    const records = [{ id: 1, name: "Line 1\r\nLine 2" }];
    const result = formatAsCsv(records);
    expect(result).toBe('id;name\n1;"Line 1\r\nLine 2"');
  });

  it("handles null/undefined values gracefully", () => {
    const records = [{ id: 1, name: null }];
    const result = formatAsCsv(records);
    const lines = result.split("\n");
    expect(lines[1]).toBe("1;");
  });
});

describe("formatAsCsvPositions", () => {
  const invoicesWithPositions = [
    {
      kundennummer: "K100",
      belegnr: "RE-001",
      datum: "2026-01-15",
      positionen: [
        { nummer: "1", bezeichnung: "Artikel A", menge: "2", einzelpreis: "10.00", gesamtpreis: "20.00" },
        { nummer: "2", bezeichnung: "Artikel B", menge: "1", einzelpreis: "5.00", gesamtpreis: "5.00" },
      ],
    },
    {
      kundennummer: "K200",
      belegnr: "RE-002",
      datum: "2026-01-16",
      positionen: [
        { nummer: "1", bezeichnung: "Artikel C", menge: "3", einzelpreis: "4.00", gesamtpreis: "12.00" },
        { nummer: "2", bezeichnung: "Artikel D", menge: "1", einzelpreis: "7.50", gesamtpreis: "7.50" },
      ],
    },
  ];

  it("explodes records to one line per position with header prefix", () => {
    const result = formatAsCsvPositions(
      invoicesWithPositions,
      "positionen",
      ["kundennummer", "belegnr", "datum"],
      ["nummer", "bezeichnung", "menge", "einzelpreis", "gesamtpreis"]
    );
    const lines = result.split("\n");
    // header + 2 records * 2 positions = 5 lines
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("K100;RE-001;2026-01-15;1;Artikel A;2;10.00;20.00");
    expect(lines[2]).toBe("K100;RE-001;2026-01-15;2;Artikel B;1;5.00;5.00");
    expect(lines[3]).toBe("K200;RE-002;2026-01-16;1;Artikel C;3;4.00;12.00");
    expect(lines[4]).toBe("K200;RE-002;2026-01-16;2;Artikel D;1;7.50;7.50");
  });

  it("builds header from headerFields then positionFields, semicolon-separated", () => {
    const result = formatAsCsvPositions(
      invoicesWithPositions,
      "positionen",
      ["kundennummer", "belegnr", "datum"],
      ["nummer", "bezeichnung", "menge", "einzelpreis", "gesamtpreis"]
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("kundennummer;belegnr;datum;nummer;bezeichnung;menge;einzelpreis;gesamtpreis");
  });

  it("skips records without a positionen key", () => {
    const records = [
      { kundennummer: "K1", belegnr: "R1" },
      {
        kundennummer: "K2",
        belegnr: "R2",
        positionen: [{ nummer: "1", bezeichnung: "X" }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2); // header + 1 position
    expect(lines[1]).toBe("K2;R2;1;X");
  });

  it("skips records with empty positionen array", () => {
    const records = [
      { kundennummer: "K1", belegnr: "R1", positionen: [] },
      {
        kundennummer: "K2",
        belegnr: "R2",
        positionen: [{ nummer: "1", bezeichnung: "Y" }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2); // header + 1 position
    expect(lines[1]).toBe("K2;R2;1;Y");
  });

  it("quotes header-field values containing semicolons", () => {
    const records = [
      {
        kundennummer: "K1; Sub",
        belegnr: "R1",
        positionen: [{ nummer: "1", bezeichnung: "Plain" }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines[1]).toBe('"K1; Sub";R1;1;Plain');
  });

  it("escapes double quotes inside position-field values", () => {
    const records = [
      {
        kundennummer: "K1",
        belegnr: "R1",
        positionen: [{ nummer: "1", bezeichnung: 'He said "hi"' }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines[1]).toBe('K1;R1;1;"He said ""hi"""');
  });

  it("renders null/undefined header-field values as empty columns", () => {
    const records = [
      {
        kundennummer: null,
        belegnr: undefined,
        positionen: [{ nummer: "1", bezeichnung: "Z" }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines[1]).toBe(";;1;Z");
  });

  it("renders null/undefined position-field values as empty columns", () => {
    const records = [
      {
        kundennummer: "K1",
        belegnr: "R1",
        positionen: [{ nummer: null, bezeichnung: undefined }],
      },
    ];
    const result = formatAsCsvPositions(records, "positionen", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines[1]).toBe("K1;R1;;");
  });

  it("returns empty string for empty records array", () => {
    expect(formatAsCsvPositions([], "positionen", ["kundennummer"], ["nummer"])).toBe("");
  });

  it("supports a custom positionsField name", () => {
    const records = [
      {
        kundennummer: "K1",
        belegnr: "R1",
        items: [
          { nummer: "1", bezeichnung: "Foo" },
          { nummer: "2", bezeichnung: "Bar" },
        ],
      },
    ];
    const result = formatAsCsvPositions(records, "items", ["kundennummer", "belegnr"], ["nummer", "bezeichnung"]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3); // header + 2 positions
    expect(lines[0]).toBe("kundennummer;belegnr;nummer;bezeichnung");
    expect(lines[1]).toBe("K1;R1;1;Foo");
    expect(lines[2]).toBe("K1;R1;2;Bar");
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
