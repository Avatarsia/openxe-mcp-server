import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { parseZeitraum } from "../utils/smart-filters.js";
import { fetchFilteredList } from "../utils/field-filter.js";
import { fetchPurchaseOrders } from "../utils/purchase-order-fetch.js";

// --- Types ---

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// --- Helpers ---

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumField(records: any[], field: string): number {
  return records.reduce((sum: number, r: any) => sum + (parseFloat(r[field]) || 0), 0);
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

/**
 * Extended zeitraum parser that handles additional shorthand values
 * not covered by the shared parseZeitraum utility.
 */
function resolveZeitraum(zeitraum: string): { von: string; bis: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (zeitraum.toLowerCase()) {
    case "dieses-jahr":
      return { von: `${year}-01-01`, bis: `${year}-12-31` };
    case "letztes-jahr":
      return { von: `${year - 1}-01-01`, bis: `${year - 1}-12-31` };
    case "letzte-12-monate": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      const von = d.toISOString().split("T")[0];
      return { von, bis: todayStr() };
    }
    default:
      return parseZeitraum(zeitraum);
  }
}

/**
 * Format a list of row objects as an aligned text table.
 */
function buildTable(columns: string[], rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "(keine Ergebnisse)";

  // Calculate column widths
  const widths = columns.map((col) => {
    let maxW = col.length;
    for (const row of rows) {
      const val = String(row[col] ?? "");
      if (val.length > maxW) maxW = val.length;
    }
    return maxW;
  });

  const header = columns.map((col, i) => col.padEnd(widths[i])).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-|-");
  const dataRows = rows.map((row) =>
    columns
      .map((col, i) => {
        const val = String(row[col] ?? "");
        // Right-align numbers
        const num = parseFloat(val);
        if (!isNaN(num) && val === String(num)) {
          return val.padStart(widths[i]);
        }
        return val.padEnd(widths[i]);
      })
      .join(" | ")
  );
  return [header, separator, ...dataRows].join("\n");
}

/**
 * Determine the quarter string (e.g. "Q1 2026") from a date string.
 */
function dateToQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

// --- Input Schemas ---

const RevenueReportInput = z.object({
  groupBy: z
    .enum(["kunde", "artikel", "monat", "quartal", "jahr", "projekt"])
    .describe("Group revenue by"),
  zeitraum: z
    .string()
    .optional()
    .describe(
      "Time period: dieser-monat, letzter-monat, dieses-jahr, letztes-jahr, Q1-2026, 2025, letzte-12-monate"
    ),
  top: z.number().optional().describe("Only show top N results (sorted by revenue desc)"),
  includeMargin: z
    .boolean()
    .optional()
    .describe("Include margin calculation (preis vs einkaufspreis on positions)"),
});

const OpenItemsReportInput = z.object({
  mode: z
    .enum(["liste", "altersstruktur", "kreditlimit"])
    .default("liste")
    .describe(
      "Report mode: liste (all open items), altersstruktur (aging buckets), kreditlimit (credit limit usage per customer)"
    ),
  kundennummer: z.string().optional().describe("Filter by specific customer"),
});

const StockReportInput = z.object({
  mode: z
    .enum(["uebersicht", "nachbestellbedarf", "lagerwert"])
    .default("uebersicht")
    .describe("Report mode"),
  belowMinimum: z
    .boolean()
    .optional()
    .describe("Only show articles below minimum stock (for uebersicht)"),
});

const ProcurementReportInput = z.object({
  mode: z
    .enum(["volumen-lieferant", "offene-bestellungen"])
    .default("volumen-lieferant")
    .describe("Report mode"),
  zeitraum: z.string().optional().describe("Time period filter"),
});

const PeriodComparisonInput = z.object({
  metric: z
    .enum(["umsatz", "auftragseingang", "neukunden", "rechnungen"])
    .describe("What to compare"),
  period: z
    .enum(["monat", "quartal", "jahr"])
    .default("monat")
    .describe("Comparison period"),
});

// --- Shared annotations ---

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true as const,
  destructiveHint: false as const,
  idempotentHint: true as const,
  openWorldHint: false as const,
};

// --- Tool Definitions ---

export const REPORT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-report-revenue",
    description:
      "Umsatzbericht: Umsaetze gruppiert nach Kunde, Artikel, Monat, Quartal, Jahr oder Projekt. " +
      "Optional mit Margenberechnung und Top-N-Filter. " +
      "Zeitraum: dieser-monat, letzter-monat, dieses-jahr, letztes-jahr, Q1-2026, 2025, letzte-12-monate.",
    inputSchema: zodToJsonSchema(RevenueReportInput) as Record<string, unknown>,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "openxe-report-open-items",
    description:
      "Offene-Posten-Liste: Alle offenen Rechnungen als Liste, Altersstruktur (Aging Buckets), " +
      "oder Kreditlimit-Auslastung pro Kunde. Zeigt ueberfaellige Tage, offene Betraege und Mahnstatus.",
    inputSchema: zodToJsonSchema(OpenItemsReportInput) as Record<string, unknown>,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "openxe-report-stock",
    description:
      "Lagerbestandsbericht: Uebersicht aller Lagerartikel, Nachbestellbedarf (unter Mindestlager), " +
      "oder Lagerwert-Berechnung. Zeigt lagernd, reserviert, verkaufbar, Mindestlager.",
    inputSchema: zodToJsonSchema(StockReportInput) as Record<string, unknown>,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "openxe-report-procurement",
    description:
      "Beschaffungsbericht: Einkaufsvolumen pro Lieferant oder offene Bestellungen mit Lieferstatus. " +
      "Optional mit Zeitraumfilter.",
    inputSchema: zodToJsonSchema(ProcurementReportInput) as Record<string, unknown>,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "openxe-report-period-comparison",
    description:
      "Periodenvergleich: Vergleicht aktuelle mit vorheriger Periode (Monat/Quartal/Jahr). " +
      "Metriken: Umsatz, Auftragseingang, Neukunden, Rechnungen. Zeigt Delta und prozentuale Veraenderung.",
    inputSchema: zodToJsonSchema(PeriodComparisonInput) as Record<string, unknown>,
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

// ============================================================================
// Tool 1: Revenue Report
// ============================================================================

async function handleRevenueReport(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { groupBy, zeitraum, top, includeMargin } = RevenueReportInput.parse(args);

  // 1. Fetch invoices (with positions for artikel grouping or margin)
  const needPositions = groupBy === "artikel" || includeMargin;
  const includeParam = needPositions ? "positionen" : undefined;
  const apiParams: Record<string, string> = { items: "1000" };
  if (includeParam) apiParams.include = includeParam;

  const result = await client.get("/v1/belege/rechnungen", apiParams);
  let invoices: any[] = Array.isArray(result.data) ? result.data : [];

  // 2. Filter by status=freigegeben
  invoices = invoices.filter(
    (r: any) => String(r.status || "").toLowerCase() === "freigegeben"
  );

  // 3. Filter by zeitraum
  if (zeitraum) {
    const { von, bis } = resolveZeitraum(zeitraum);
    invoices = invoices.filter(
      (r: any) => r.datum && r.datum >= von && r.datum <= bis
    );
  }

  // 4. Group by the requested dimension
  type GroupEntry = {
    umsatz: number;
    anzahl: number;
    marge: number;
  };
  const groups = new Map<string, GroupEntry>();

  function getOrCreate(key: string): GroupEntry {
    let entry = groups.get(key);
    if (!entry) {
      entry = { umsatz: 0, anzahl: 0, marge: 0 };
      groups.set(key, entry);
    }
    return entry;
  }

  if (groupBy === "artikel") {
    // Iterate positions
    for (const inv of invoices) {
      const positionen = inv.positionen || inv.position || [];
      const posList = Array.isArray(positionen) ? positionen : [positionen];
      for (const pos of posList) {
        if (!pos) continue;
        const key = String(pos.nummer || pos.artikelnummer || "(ohne Nummer)");
        const entry = getOrCreate(key);
        const menge = parseFloat(pos.menge) || 0;
        const preis = parseFloat(pos.preis) || 0;
        entry.umsatz += menge * preis;
        entry.anzahl++;
        if (includeMargin) {
          const ek = parseFloat(pos.einkaufspreis) || 0;
          entry.marge += (preis - ek) * menge;
        }
      }
    }
  } else {
    for (const inv of invoices) {
      let key: string;
      switch (groupBy) {
        case "kunde":
          key = String(inv.kundennummer || inv.name || "(unbekannt)");
          break;
        case "monat":
          key = String(inv.datum || "").substring(0, 7); // YYYY-MM
          break;
        case "quartal":
          key = inv.datum ? dateToQuarter(inv.datum) : "(unbekannt)";
          break;
        case "jahr":
          key = String(inv.datum || "").substring(0, 4);
          break;
        case "projekt":
          key = String(inv.projekt || "(kein Projekt)");
          break;
        default:
          key = "(unbekannt)";
      }
      const entry = getOrCreate(key);
      entry.umsatz += parseFloat(inv.soll) || 0;
      entry.anzahl++;
    }
  }

  // 5. Build result rows, sort by revenue desc
  let rows: Record<string, string | number>[] = [];
  for (const [key, entry] of groups) {
    const row: Record<string, string | number> = {
      [groupBy]: key,
      umsatz_netto: round2(entry.umsatz),
      anzahl_rechnungen: entry.anzahl,
    };
    if (includeMargin) {
      row.marge = round2(entry.marge);
    }
    rows.push(row);
  }
  rows.sort((a, b) => (b.umsatz_netto as number) - (a.umsatz_netto as number));

  // 6. Apply top limit
  if (top && top > 0) {
    rows = rows.slice(0, top);
  }

  // 7. Format output
  const columns = includeMargin
    ? [groupBy, "umsatz_netto", "anzahl_rechnungen", "marge"]
    : [groupBy, "umsatz_netto", "anzahl_rechnungen"];

  const totalUmsatz = round2(rows.reduce((s, r) => s + (r.umsatz_netto as number), 0));
  const totalAnzahl = rows.reduce((s, r) => s + (r.anzahl_rechnungen as number), 0);

  let text = `=== Umsatzbericht (gruppiert nach ${groupBy}) ===\n`;
  if (zeitraum) text += `Zeitraum: ${zeitraum}\n`;
  text += `\n${buildTable(columns, rows)}\n`;
  text += `\n--- Summe: ${totalUmsatz} EUR, ${totalAnzahl} Rechnungen`;
  if (top) text += ` (Top ${top})`;
  text += ` ---`;

  return { content: [{ type: "text", text }] };
}

// ============================================================================
// Tool 2: Open Items Report
// ============================================================================

async function handleOpenItemsReport(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { mode, kundennummer } = OpenItemsReportInput.parse(args);

  // Fetch all invoices
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { items: "1000" },
    { maxResults: 2000, skipSlim: true, fetchAll: true }
  );
  let invoices: any[] = result.data;

  // Filter to open items: soll > ist AND status=freigegeben
  invoices = invoices.filter((r: any) => {
    const soll = parseFloat(r.soll) || 0;
    const ist = parseFloat(r.ist) || 0;
    if (soll <= ist) return false;
    if (String(r.status || "").toLowerCase() !== "freigegeben") return false;
    return true;
  });

  // Optional customer filter
  if (kundennummer) {
    invoices = invoices.filter(
      (r: any) => String(r.kundennummer || "") === kundennummer
    );
  }

  const todayDate = todayStr();

  if (mode === "liste") {
    const rows: Record<string, string | number>[] = invoices.map((r: any) => {
      const soll = parseFloat(r.soll) || 0;
      const ist = parseFloat(r.ist) || 0;
      const offen = round2(soll - ist);
      const zahlungszieltage = parseInt(r.zahlungszieltage) || 30;
      const datumDate = new Date(r.datum);
      datumDate.setDate(datumDate.getDate() + zahlungszieltage);
      const faelligAm = datumDate.toISOString().split("T")[0];
      const ueberfaelligTage = Math.max(0, daysBetween(faelligAm, todayDate));

      return {
        belegnr: r.belegnr || "",
        kunde: r.name || r.kundennummer || "",
        datum: r.datum || "",
        faellig_am: faelligAm,
        soll: round2(soll),
        ist: round2(ist),
        offen,
        ueberfaellig_tage: ueberfaelligTage,
        mahnwesen: r.mahnwesen || r.mahnung || "",
      };
    });

    // Sort by ueberfaellig_tage desc
    rows.sort(
      (a, b) => (b.ueberfaellig_tage as number) - (a.ueberfaellig_tage as number)
    );

    const totalOffen = round2(
      rows.reduce((s, r) => s + (r.offen as number), 0)
    );

    const columns = [
      "belegnr",
      "kunde",
      "datum",
      "faellig_am",
      "soll",
      "ist",
      "offen",
      "ueberfaellig_tage",
      "mahnwesen",
    ];
    let text = `=== Offene Posten (Liste) ===\n`;
    text += `${rows.length} offene Rechnungen\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- Summe offen: ${totalOffen} EUR ---`;

    return { content: [{ type: "text", text }] };
  }

  if (mode === "altersstruktur") {
    const buckets: Record<string, { anzahl: number; summe: number }> = {
      aktuell: { anzahl: 0, summe: 0 },
      "1-30 Tage": { anzahl: 0, summe: 0 },
      "31-60 Tage": { anzahl: 0, summe: 0 },
      "61-90 Tage": { anzahl: 0, summe: 0 },
      "ueber 90 Tage": { anzahl: 0, summe: 0 },
    };

    for (const r of invoices) {
      const soll = parseFloat(r.soll) || 0;
      const ist = parseFloat(r.ist) || 0;
      const offen = soll - ist;
      const zahlungszieltage = parseInt(r.zahlungszieltage) || 30;
      const datumDate = new Date(r.datum);
      datumDate.setDate(datumDate.getDate() + zahlungszieltage);
      const faelligAm = datumDate.toISOString().split("T")[0];
      const ueberfaelligTage = Math.max(0, daysBetween(faelligAm, todayDate));

      let bucket: string;
      if (ueberfaelligTage === 0) bucket = "aktuell";
      else if (ueberfaelligTage <= 30) bucket = "1-30 Tage";
      else if (ueberfaelligTage <= 60) bucket = "31-60 Tage";
      else if (ueberfaelligTage <= 90) bucket = "61-90 Tage";
      else bucket = "ueber 90 Tage";

      buckets[bucket].anzahl++;
      buckets[bucket].summe += offen;
    }

    const rows: Record<string, string | number>[] = Object.entries(buckets).map(
      ([name, data]) => ({
        bucket: name,
        anzahl: data.anzahl,
        summe_offen: round2(data.summe),
      })
    );

    const totalOffen = round2(
      rows.reduce((s, r) => s + (r.summe_offen as number), 0)
    );

    let text = `=== Altersstruktur offene Posten ===\n\n`;
    text += buildTable(["bucket", "anzahl", "summe_offen"], rows);
    text += `\n\n--- Gesamt offen: ${totalOffen} EUR (${invoices.length} Rechnungen) ---`;

    return { content: [{ type: "text", text }] };
  }

  if (mode === "kreditlimit") {
    // Group open items by customer
    const byKunde = new Map<
      string,
      { name: string; offen: number; count: number }
    >();
    for (const r of invoices) {
      const kn = String(r.kundennummer || "");
      if (!kn) continue;
      const soll = parseFloat(r.soll) || 0;
      const ist = parseFloat(r.ist) || 0;
      const offen = soll - ist;
      const entry = byKunde.get(kn) || { name: r.name || kn, offen: 0, count: 0 };
      entry.offen += offen;
      entry.count++;
      byKunde.set(kn, entry);
    }

    // Fetch addresses for kreditlimit
    const addrResult = await fetchFilteredList(
      client,
      "/v1/adressen",
      { items: "1000" },
      { maxResults: 5000, skipSlim: true, fetchAll: true }
    );
    const addresses = addrResult.data;
    const addrMap = new Map<string, any>();
    for (const a of addresses) {
      const kn = String(a.kundennummer || "");
      if (kn) addrMap.set(kn, a);
    }

    const rows: Record<string, string | number>[] = [];
    for (const [kn, entry] of byKunde) {
      const addr = addrMap.get(kn);
      const kreditlimit = parseFloat(addr?.kreditlimit) || 0;
      const auslastung =
        kreditlimit > 0 ? round2((entry.offen / kreditlimit) * 100) : 0;
      rows.push({
        kundennummer: kn,
        name: entry.name,
        kreditlimit: round2(kreditlimit),
        offen_gesamt: round2(entry.offen),
        "auslastung_%": kreditlimit > 0 ? auslastung : "n/a",
      });
    }

    // Sort by auslastung descending (n/a at end)
    rows.sort((a, b) => {
      const aVal = typeof a["auslastung_%"] === "number" ? a["auslastung_%"] : -1;
      const bVal = typeof b["auslastung_%"] === "number" ? b["auslastung_%"] : -1;
      return (bVal as number) - (aVal as number);
    });

    let text = `=== Kreditlimit-Auslastung ===\n\n`;
    text += buildTable(
      ["kundennummer", "name", "kreditlimit", "offen_gesamt", "auslastung_%"],
      rows
    );
    text += `\n\n--- ${rows.length} Kunden mit offenen Posten ---`;

    return { content: [{ type: "text", text }] };
  }

  return {
    content: [{ type: "text", text: `Unbekannter Modus: ${mode}` }],
    isError: true,
  };
}

// ============================================================================
// Tool 3: Stock Report
// ============================================================================

async function handleStockReport(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { mode, belowMinimum } = StockReportInput.parse(args);

  if (mode === "lagerwert") {
    // Fetch articles with lagerbestand and verkaufspreise
    const result = await client.get("/v1/artikel", {
      items: "1000",
      include: "lagerbestand,verkaufspreise",
    });
    let articles: any[] = Array.isArray(result.data) ? result.data : [];
    articles = articles.filter(
      (a: any) => String(a.lagerartikel || "0") === "1"
    );

    const rows: Record<string, string | number>[] = [];
    let totalWert = 0;

    for (const a of articles) {
      const lb = a.lagerbestand || {};
      const lagernd = parseFloat(lb.lagernd || lb.menge || a.lagernd || "0") || 0;
      if (lagernd <= 0) continue;

      // Get first VK price
      let vkPreis = 0;
      const preise = a.verkaufspreise;
      if (Array.isArray(preise) && preise.length > 0) {
        vkPreis = parseFloat(preise[0].preis || preise[0].bruttopreis || "0") || 0;
      } else if (preise && typeof preise === "object") {
        vkPreis = parseFloat(preise.preis || preise.bruttopreis || "0") || 0;
      }

      const vkWert = round2(lagernd * vkPreis);
      totalWert += vkWert;

      rows.push({
        nummer: a.nummer || "",
        name_de: String(a.name_de || "").substring(0, 40),
        lagernd,
        vk_preis: round2(vkPreis),
        vk_wert: vkWert,
      });
    }

    // Sort by value desc
    rows.sort((a, b) => (b.vk_wert as number) - (a.vk_wert as number));

    // Add total row
    rows.push({
      nummer: "---",
      name_de: "GESAMT",
      lagernd: rows.reduce((s, r) => s + (r.lagernd as number), 0),
      vk_preis: "",
      vk_wert: round2(totalWert),
    });

    const columns = ["nummer", "name_de", "lagernd", "vk_preis", "vk_wert"];
    let text = `=== Lagerwert-Bericht ===\n`;
    text += `${rows.length - 1} Lagerartikel mit Bestand\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- Gesamter Lagerwert (VK): ${round2(totalWert)} EUR ---`;

    return { content: [{ type: "text", text }] };
  }

  // uebersicht and nachbestellbedarf: fetch with lagerbestand
  const result = await client.get("/v1/artikel", {
    items: "1000",
    include: "lagerbestand",
  });
  let articles: any[] = Array.isArray(result.data) ? result.data : [];
  articles = articles.filter(
    (a: any) => String(a.lagerartikel || "0") === "1"
  );

  if (mode === "uebersicht") {
    let rows: Record<string, string | number>[] = articles.map((a: any) => {
      const lb = a.lagerbestand || {};
      const lagernd = parseFloat(lb.lagernd || lb.menge || a.lagernd || "0") || 0;
      const reserviert = parseFloat(lb.reserviert || "0") || 0;
      const verkaufbar = parseFloat(lb.verkaufbar || "0") || 0;
      const mindestlager = parseFloat(a.mindestlager || "0") || 0;

      return {
        nummer: a.nummer || "",
        name_de: String(a.name_de || "").substring(0, 40),
        lagernd,
        reserviert,
        verkaufbar,
        mindestlager,
      };
    });

    if (belowMinimum) {
      rows = rows.filter(
        (r) =>
          (r.mindestlager as number) > 0 &&
          (r.lagernd as number) < (r.mindestlager as number)
      );
    }

    // Sort by lagernd ascending (lowest stock first)
    rows.sort((a, b) => (a.lagernd as number) - (b.lagernd as number));

    const columns = [
      "nummer",
      "name_de",
      "lagernd",
      "reserviert",
      "verkaufbar",
      "mindestlager",
    ];
    let text = `=== Lagerbestandsuebersicht ===\n`;
    if (belowMinimum) text += `Nur Artikel unter Mindestlager\n`;
    text += `${rows.length} Lagerartikel\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- ${rows.length} Artikel angezeigt ---`;

    return { content: [{ type: "text", text }] };
  }

  if (mode === "nachbestellbedarf") {
    const rows: Record<string, string | number>[] = [];

    for (const a of articles) {
      const lb = a.lagerbestand || {};
      const lagernd = parseFloat(lb.lagernd || lb.menge || a.lagernd || "0") || 0;
      const mindestlager = parseFloat(a.mindestlager || "0") || 0;
      if (mindestlager <= 0 || lagernd > mindestlager) continue;

      const offeneAuftraege =
        parseFloat(lb.offene_auftraege || lb.reserviert || "0") || 0;
      const offeneBestellungen =
        parseFloat(lb.offene_bestellungen || "0") || 0;
      const fehlmenge = Math.max(
        0,
        mindestlager - lagernd + offeneAuftraege - offeneBestellungen
      );

      rows.push({
        nummer: a.nummer || "",
        name_de: String(a.name_de || "").substring(0, 40),
        lagernd,
        mindestlager,
        fehlmenge: round2(fehlmenge),
        offene_bestellungen: offeneBestellungen,
      });
    }

    // Sort by fehlmenge desc
    rows.sort((a, b) => (b.fehlmenge as number) - (a.fehlmenge as number));

    const columns = [
      "nummer",
      "name_de",
      "lagernd",
      "mindestlager",
      "fehlmenge",
      "offene_bestellungen",
    ];
    let text = `=== Nachbestellbedarf ===\n`;
    text += `${rows.length} Artikel unter Mindestlager\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- ${rows.length} Artikel mit Nachbestellbedarf ---`;

    return { content: [{ type: "text", text }] };
  }

  return {
    content: [{ type: "text", text: `Unbekannter Modus: ${mode}` }],
    isError: true,
  };
}

// ============================================================================
// Tool 4: Procurement Report
// ============================================================================

async function handleProcurementReport(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { mode, zeitraum } = ProcurementReportInput.parse(args);

  // Fetch purchase orders via shared utility
  let orders = await fetchPurchaseOrders(client);

  if (mode === "volumen-lieferant") {
    // Filter by zeitraum if set
    if (zeitraum) {
      const { von, bis } = resolveZeitraum(zeitraum);
      orders = orders.filter(
        (r: any) => r.datum && r.datum >= von && r.datum <= bis
      );
    }

    // Group by lieferantennummer
    const byLieferant = new Map<
      string,
      { name: string; anzahl: number; volumen: number }
    >();
    for (const o of orders) {
      const ln = String(o.lieferantennummer || o.adresse || "(unbekannt)");
      const entry = byLieferant.get(ln) || {
        name: o.name || ln,
        anzahl: 0,
        volumen: 0,
      };
      entry.anzahl++;
      entry.volumen += parseFloat(o.gesamtsumme) || 0;
      byLieferant.set(ln, entry);
    }

    const rows: Record<string, string | number>[] = [];
    for (const [ln, entry] of byLieferant) {
      rows.push({
        lieferantennummer: ln,
        name: String(entry.name).substring(0, 40),
        anzahl_bestellungen: entry.anzahl,
        volumen_gesamt: round2(entry.volumen),
      });
    }

    // Sort by volume desc
    rows.sort(
      (a, b) => (b.volumen_gesamt as number) - (a.volumen_gesamt as number)
    );

    const totalVolumen = round2(
      rows.reduce((s, r) => s + (r.volumen_gesamt as number), 0)
    );

    const columns = [
      "lieferantennummer",
      "name",
      "anzahl_bestellungen",
      "volumen_gesamt",
    ];
    let text = `=== Beschaffungsvolumen nach Lieferant ===\n`;
    if (zeitraum) text += `Zeitraum: ${zeitraum}\n`;
    text += `${rows.length} Lieferanten\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- Gesamtvolumen: ${totalVolumen} EUR (${orders.length} Bestellungen) ---`;

    return { content: [{ type: "text", text }] };
  }

  if (mode === "offene-bestellungen") {
    // Filter to active statuses
    const activeStatuses = ["offen", "freigegeben", "bestellt", "angemahnt"];
    orders = orders.filter((r: any) =>
      activeStatuses.includes(String(r.status || "").toLowerCase())
    );

    // Filter by zeitraum if set
    if (zeitraum) {
      const { von, bis } = resolveZeitraum(zeitraum);
      orders = orders.filter(
        (r: any) => r.datum && r.datum >= von && r.datum <= bis
      );
    }

    const todayDate = todayStr();
    const rows: Record<string, string | number>[] = orders.map((o: any) => {
      const lieferdatum = o.lieferdatum || "";
      const hasRealDate = lieferdatum && lieferdatum > "0000-00-00";
      const ueberfaellig =
        hasRealDate && lieferdatum < todayDate ? "ja" : "nein";
      return {
        belegnr: o.belegnr || "",
        name: String(o.name || "").substring(0, 30),
        lieferantennummer: o.lieferantennummer || "",
        datum: o.datum || "",
        lieferdatum,
        gesamtsumme: round2(parseFloat(o.gesamtsumme) || 0),
        status: o.status || "",
        ueberfaellig,
      };
    });

    // Sort: overdue first, then by datum
    rows.sort((a, b) => {
      if (a.ueberfaellig === "ja" && b.ueberfaellig !== "ja") return -1;
      if (a.ueberfaellig !== "ja" && b.ueberfaellig === "ja") return 1;
      return String(a.datum).localeCompare(String(b.datum));
    });

    const totalSumme = round2(
      rows.reduce((s, r) => s + (r.gesamtsumme as number), 0)
    );
    const ueberfaelligCount = rows.filter(
      (r) => r.ueberfaellig === "ja"
    ).length;

    const columns = [
      "belegnr",
      "name",
      "lieferantennummer",
      "datum",
      "lieferdatum",
      "gesamtsumme",
      "status",
      "ueberfaellig",
    ];
    let text = `=== Offene Bestellungen ===\n`;
    if (zeitraum) text += `Zeitraum: ${zeitraum}\n`;
    text += `${rows.length} offene Bestellungen`;
    if (ueberfaelligCount > 0) text += ` (${ueberfaelligCount} ueberfaellig)`;
    text += `\n\n`;
    text += buildTable(columns, rows);
    text += `\n\n--- Gesamtsumme: ${totalSumme} EUR ---`;

    return { content: [{ type: "text", text }] };
  }

  return {
    content: [{ type: "text", text: `Unbekannter Modus: ${mode}` }],
    isError: true,
  };
}

// ============================================================================
// Tool 5: Period Comparison
// ============================================================================

function getPeriodDates(
  period: "monat" | "quartal" | "jahr"
): { current: { von: string; bis: string }; previous: { von: string; bis: string }; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "monat": {
      const currStart = new Date(year, month, 1);
      const currEnd = new Date(year, month + 1, 0);
      const prevStart = new Date(year, month - 1, 1);
      const prevEnd = new Date(year, month, 0);
      return {
        current: {
          von: currStart.toISOString().split("T")[0],
          bis: currEnd.toISOString().split("T")[0],
        },
        previous: {
          von: prevStart.toISOString().split("T")[0],
          bis: prevEnd.toISOString().split("T")[0],
        },
        label: "Monat",
      };
    }
    case "quartal": {
      const currQ = Math.floor(month / 3);
      const currStart = new Date(year, currQ * 3, 1);
      const currEnd = new Date(year, currQ * 3 + 3, 0);
      const prevQStart = new Date(year, currQ * 3 - 3, 1);
      const prevQEnd = new Date(year, currQ * 3, 0);
      return {
        current: {
          von: currStart.toISOString().split("T")[0],
          bis: currEnd.toISOString().split("T")[0],
        },
        previous: {
          von: prevQStart.toISOString().split("T")[0],
          bis: prevQEnd.toISOString().split("T")[0],
        },
        label: "Quartal",
      };
    }
    case "jahr": {
      return {
        current: { von: `${year}-01-01`, bis: `${year}-12-31` },
        previous: { von: `${year - 1}-01-01`, bis: `${year - 1}-12-31` },
        label: "Jahr",
      };
    }
  }
}

async function handlePeriodComparison(
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const { metric, period } = PeriodComparisonInput.parse(args);
  const { current, previous, label } = getPeriodDates(period);

  let aktuell = 0;
  let vorperiode = 0;
  let einheit = "";
  let details = "";

  switch (metric) {
    case "umsatz": {
      const result = await fetchFilteredList(
        client,
        "/v1/belege/rechnungen",
        { items: "1000" },
        { maxResults: 2000, skipSlim: true, fetchAll: true }
      );
      const invoices = result.data.filter(
        (r: any) => String(r.status || "").toLowerCase() === "freigegeben"
      );

      const currInv = invoices.filter(
        (r: any) => r.datum && r.datum >= current.von && r.datum <= current.bis
      );
      const prevInv = invoices.filter(
        (r: any) => r.datum && r.datum >= previous.von && r.datum <= previous.bis
      );

      aktuell = round2(sumField(currInv, "soll"));
      vorperiode = round2(sumField(prevInv, "soll"));
      einheit = "EUR";
      details = `Basis: ${currInv.length} vs ${prevInv.length} Rechnungen`;
      break;
    }

    case "auftragseingang": {
      const result = await fetchFilteredList(
        client,
        "/v1/belege/auftraege",
        { items: "1000" },
        { maxResults: 2000, skipSlim: true, fetchAll: true }
      );
      const orders = result.data;

      const currOrd = orders.filter(
        (r: any) => r.datum && r.datum >= current.von && r.datum <= current.bis
      );
      const prevOrd = orders.filter(
        (r: any) => r.datum && r.datum >= previous.von && r.datum <= previous.bis
      );

      aktuell = round2(sumField(currOrd, "gesamtsumme"));
      vorperiode = round2(sumField(prevOrd, "gesamtsumme"));
      einheit = "EUR";
      details = `Anzahl: ${currOrd.length} vs ${prevOrd.length} Auftraege`;
      break;
    }

    case "neukunden": {
      const result = await fetchFilteredList(
        client,
        "/v1/adressen",
        { items: "1000" },
        { maxResults: 5000, skipSlim: true, fetchAll: true }
      );
      const addresses = result.data.filter((a: any) => {
        const kn = String(a.kundennummer || "").trim();
        return kn !== "" && !kn.startsWith("DEL");
      });

      // Use logdatei or datum_angelegt for creation date
      const currAddr = addresses.filter((a: any) => {
        const d = a.logdatei || a.datum || a.zeitstempel || "";
        const dateStr = String(d).substring(0, 10);
        return dateStr >= current.von && dateStr <= current.bis;
      });
      const prevAddr = addresses.filter((a: any) => {
        const d = a.logdatei || a.datum || a.zeitstempel || "";
        const dateStr = String(d).substring(0, 10);
        return dateStr >= previous.von && dateStr <= previous.bis;
      });

      aktuell = currAddr.length;
      vorperiode = prevAddr.length;
      einheit = "Kunden";
      details = "Neue Kunden mit Kundennummer im Zeitraum";
      break;
    }

    case "rechnungen": {
      const result = await fetchFilteredList(
        client,
        "/v1/belege/rechnungen",
        { items: "1000" },
        { maxResults: 2000, skipSlim: true, fetchAll: true }
      );
      const invoices = result.data;

      const currInv = invoices.filter(
        (r: any) => r.datum && r.datum >= current.von && r.datum <= current.bis
      );
      const prevInv = invoices.filter(
        (r: any) => r.datum && r.datum >= previous.von && r.datum <= previous.bis
      );

      aktuell = currInv.length;
      vorperiode = prevInv.length;
      einheit = "Rechnungen";
      details = "Alle Rechnungen im Zeitraum";
      break;
    }
  }

  const delta = round2(aktuell - vorperiode);
  const veraenderungProzent =
    vorperiode !== 0 ? round2((delta / vorperiode) * 100) : aktuell > 0 ? 100 : 0;

  const trend = delta > 0 ? "+" : delta < 0 ? "" : "";

  let text = `=== Periodenvergleich: ${metric} (${label}) ===\n\n`;
  text += `Aktuell  (${current.von} bis ${current.bis}): ${aktuell} ${einheit}\n`;
  text += `Vorperiode (${previous.von} bis ${previous.bis}): ${vorperiode} ${einheit}\n`;
  text += `Delta: ${trend}${delta} ${einheit} (${trend}${veraenderungProzent}%)\n`;
  if (details) text += `\n${details}`;

  return { content: [{ type: "text", text }] };
}

// ============================================================================
// Main Dispatcher
// ============================================================================

export async function handleReportTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-report-revenue":
      return handleRevenueReport(args, client);
    case "openxe-report-open-items":
      return handleOpenItemsReport(args, client);
    case "openxe-report-stock":
      return handleStockReport(args, client);
    case "openxe-report-procurement":
      return handleProcurementReport(args, client);
    case "openxe-report-period-comparison":
      return handlePeriodComparison(args, client);
    default:
      return {
        content: [{ type: "text", text: `Unknown report tool: ${toolName}` }],
        isError: true,
      };
  }
}
