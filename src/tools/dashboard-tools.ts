import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
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

// --- KPI definitions ---

const KPI_NAMES = [
  "umsatz-monat",
  "umsatz-jahr",
  "offene-auftraege",
  "offene-rechnungen",
  "ueberfaellige-rechnungen",
  "top-kunde",
  "auftragseingang-woche",
  "artikel-anzahl",
  "kunden-anzahl",
  "offene-bestellungen",
  "bestellvolumen-monat",
] as const;

type KpiName = (typeof KPI_NAMES)[number];

const DashboardInput = z.object({
  kpi: z
    .enum(KPI_NAMES)
    .describe(
      "KPI-Name: umsatz-monat, umsatz-jahr, offene-auftraege, offene-rechnungen, " +
        "ueberfaellige-rechnungen, top-kunde, auftragseingang-woche, artikel-anzahl, kunden-anzahl, " +
        "offene-bestellungen, bestellvolumen-monat"
    ),
});

// --- Tool definition ---

export const DASHBOARD_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-dashboard",
    description:
      "Dashboard-KPI abrufen. Liefert eine einzelne Kennzahl (z.B. Umsatz, offene Auftraege, " +
      "Top-Kunde). Token-effizient: ~30 Tokens pro Antwort. " +
      "Verfuegbare KPIs: umsatz-monat, umsatz-jahr, offene-auftraege, offene-rechnungen, " +
      "ueberfaellige-rechnungen, top-kunde, auftragseingang-woche, artikel-anzahl, kunden-anzahl, " +
      "offene-bestellungen, bestellvolumen-monat.",
    inputSchema: zodToJsonSchema(DashboardInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// --- Date helpers ---

function monthStart(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return y + "-" + m + "-01";
}

function yearStart(now: Date): string {
  return now.getFullYear() + "-01-01";
}

function weekStart(now: Date): string {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

function today(now: Date): string {
  return now.toISOString().split("T")[0];
}

const MONTH_NAMES = [
  "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monthLabel(now: Date): string {
  return MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
}

// --- Aggregation helpers ---

function sumField(records: any[], field: string): number {
  return records.reduce((sum: number, r: any) => sum + (parseFloat(r[field]) || 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- KPI handlers ---

async function kpiUmsatzMonat(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: monthStart(now), datum_lte: today(now) },
    { maxResults: 500 }
  );
  const summe = round2(sumField(result.data, "soll"));
  return {
    kpi: "umsatz-monat",
    wert: summe,
    waehrung: "EUR",
    zeitraum: monthLabel(now),
    basis: result.data.length + " Rechnungen",
  };
}

async function kpiUmsatzJahr(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: yearStart(now), datum_lte: today(now) },
    { maxResults: 2000 }
  );
  const summe = round2(sumField(result.data, "soll"));
  return {
    kpi: "umsatz-jahr",
    wert: summe,
    waehrung: "EUR",
    zeitraum: String(now.getFullYear()),
    basis: result.data.length + " Rechnungen",
  };
}

async function kpiOffeneAuftraege(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/auftraege",
    { status: "freigegeben" },
    { maxResults: 500 }
  );
  return {
    kpi: "offene-auftraege",
    wert: result.data.length,
    status: "freigegeben",
  };
}

async function kpiOffeneRechnungen(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { status: "freigegeben" },
    { maxResults: 1000 }
  );
  const unbezahlt = result.data.filter((r: any) => {
    const soll = parseFloat(r.soll) || 0;
    const ist = parseFloat(r.ist) || 0;
    return soll > ist;
  });
  const summe = round2(sumField(unbezahlt, "soll") - sumField(unbezahlt, "ist"));
  return {
    kpi: "offene-rechnungen",
    anzahl: unbezahlt.length,
    offener_betrag: summe,
    waehrung: "EUR",
  };
}

async function kpiUeberfaelligeRechnungen(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { status: "freigegeben" },
    { maxResults: 1000 }
  );
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const ueberfaellig = result.data.filter((r: any) => {
    const soll = parseFloat(r.soll) || 0;
    const ist = parseFloat(r.ist) || 0;
    return soll > ist && r.datum && r.datum <= cutoffStr;
  });
  const summe = round2(sumField(ueberfaellig, "soll") - sumField(ueberfaellig, "ist"));
  return {
    kpi: "ueberfaellige-rechnungen",
    anzahl: ueberfaellig.length,
    offener_betrag: summe,
    waehrung: "EUR",
    schwelle: ">30 Tage",
  };
}

async function kpiTopKunde(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: yearStart(now), datum_lte: today(now) },
    { maxResults: 2000 }
  );
  const byKunde = new Map<string, { name: string; summe: number; count: number }>();
  for (const r of result.data) {
    const kn = String(r.kundennummer || "unbekannt");
    const entry = byKunde.get(kn) || { name: r.name || kn, summe: 0, count: 0 };
    entry.summe += parseFloat(r.soll) || 0;
    entry.count++;
    byKunde.set(kn, entry);
  }
  let top = { kundennummer: "-", name: "-", summe: 0, count: 0 };
  for (const [kn, entry] of byKunde) {
    if (entry.summe > top.summe) {
      top = { kundennummer: kn, name: entry.name, summe: entry.summe, count: entry.count };
    }
  }
  return {
    kpi: "top-kunde",
    kundennummer: top.kundennummer,
    name: top.name,
    umsatz: round2(top.summe),
    waehrung: "EUR",
    zeitraum: String(now.getFullYear()),
    basis: top.count + " Rechnungen",
  };
}

async function kpiAuftragseingangWoche(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/auftraege",
    { datum_gte: weekStart(now), datum_lte: today(now) },
    { maxResults: 500 }
  );
  const summe = round2(sumField(result.data, "gesamtsumme"));
  return {
    kpi: "auftragseingang-woche",
    anzahl: result.data.length,
    summe,
    waehrung: "EUR",
    zeitraum: "KW ab " + weekStart(now),
  };
}

async function kpiArtikelAnzahl(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/artikel",
    {},
    { maxResults: 5000 }
  );
  const aktiv = result.data.filter((r: any) => String(r.inaktiv || "0") !== "1");
  return {
    kpi: "artikel-anzahl",
    wert: aktiv.length,
    gesamt: result.data.length,
  };
}

async function kpiKundenAnzahl(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/adressen",
    {},
    { includeDeleted: false }
  );
  const kunden = result.data.filter((a: any) => {
    const knr = String(a.kundennummer || "").trim();
    return knr !== "" && !knr.startsWith("DEL");
  });
  return {
    kpi: "kunden-anzahl",
    wert: kunden.length,
    label: "aktive Kunden mit Kundennummer",
  };
}

// --- Procurement KPIs ---
// NOTE: Bestellungen (purchase orders) use the Legacy API, not REST v1.
// We try BelegeList first (efficient), then fall back to iterative BestellungGet.

async function fetchPurchaseOrdersForKpi(client: OpenXEClient): Promise<any[]> {
  return fetchPurchaseOrders(client);
}

async function kpiOffeneBestellungen(client: OpenXEClient): Promise<Record<string, unknown>> {
  const data = await fetchPurchaseOrdersForKpi(client);
  const aktiv = data.filter((r: any) =>
    ["offen", "freigegeben", "bestellt", "angemahnt"].includes(String(r.status || "").toLowerCase())
  );
  const summe = round2(sumField(aktiv, "gesamtsumme"));
  return {
    kpi: "offene-bestellungen",
    anzahl: aktiv.length,
    gesamtsumme: summe,
    waehrung: "EUR",
    status_verteilung: {
      offen: aktiv.filter((r: any) => r.status === "offen").length,
      freigegeben: aktiv.filter((r: any) => r.status === "freigegeben").length,
      bestellt: aktiv.filter((r: any) => r.status === "bestellt").length,
      angemahnt: aktiv.filter((r: any) => r.status === "angemahnt").length,
    },
  };
}

async function kpiBestellvolumenMonat(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const data = await fetchPurchaseOrdersForKpi(client);
  const mStart = monthStart(now);
  const tDay = today(now);
  const monat = data.filter((r: any) => r.datum && r.datum >= mStart && r.datum <= tDay);
  const summe = round2(sumField(monat, "gesamtsumme"));
  return {
    kpi: "bestellvolumen-monat",
    wert: summe,
    waehrung: "EUR",
    zeitraum: monthLabel(now),
    basis: monat.length + " Bestellungen",
  };
}

// --- Dispatcher ---

const KPI_HANDLERS: Record<KpiName, (client: OpenXEClient, now: Date) => Promise<Record<string, unknown>>> = {
  "umsatz-monat": kpiUmsatzMonat,
  "umsatz-jahr": kpiUmsatzJahr,
  "offene-auftraege": (client) => kpiOffeneAuftraege(client),
  "offene-rechnungen": (client) => kpiOffeneRechnungen(client),
  "ueberfaellige-rechnungen": kpiUeberfaelligeRechnungen,
  "top-kunde": kpiTopKunde,
  "auftragseingang-woche": kpiAuftragseingangWoche,
  "artikel-anzahl": (client) => kpiArtikelAnzahl(client),
  "kunden-anzahl": (client) => kpiKundenAnzahl(client),
  "offene-bestellungen": (client) => kpiOffeneBestellungen(client),
  "bestellvolumen-monat": kpiBestellvolumenMonat,
};

export async function handleDashboardTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient,
  now?: Date
): Promise<ToolResult> {
  if (toolName !== "openxe-dashboard") {
    return {
      content: [{ type: "text", text: "Unknown dashboard tool: " + toolName }],
      isError: true,
    };
  }

  const { kpi } = DashboardInput.parse(args);
  const timestamp = now ?? new Date();

  const handler = KPI_HANDLERS[kpi];
  const result = await handler(client, timestamp);

  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

// Exported for testing
export { KPI_NAMES, DashboardInput, monthStart, yearStart, weekStart, today, monthLabel, round2, sumField };
export type { KpiName };
