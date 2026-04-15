import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";
import { fetchFilteredList, FETCH_ALL_SAFETY_CAP } from "../utils/field-filter.js";
import { fetchPurchaseOrdersWithMeta, PURCHASE_ORDER_SCAN_CAP } from "../utils/purchase-order-fetch.js";
import { localDateString } from "../utils/local-date.js";
import { isInvoiceOverdue } from "../utils/invoice-aging.js";

/**
 * KPIs must never under-report silently. If fetchFilteredList had to stop
 * because of the safety cap (defect pagination or legitimately huge dataset),
 * we attach a loud `_warning` so the caller can treat the KPI as a lower
 * bound instead of a true count.
 */
function withTruncationWarning(
  payload: Record<string, unknown>,
  meta: { truncated: boolean }
): Record<string, unknown> {
  if (!meta.truncated) return payload;
  return {
    ...payload,
    _warning:
      `Result is a lower bound — underlying dataset exceeds the safety cap ` +
      `of ${FETCH_ALL_SAFETY_CAP} records. Raise FETCH_ALL_SAFETY_CAP or ` +
      `narrow the query.`,
  };
}

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
  return localDateString(d);
}

function today(now: Date): string {
  return localDateString(now);
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

// All KPIs use fetchAll: true — we want exact counts/sums, not the first N
// records. If the dataset exceeds FETCH_ALL_SAFETY_CAP, meta.truncated is
// set and withTruncationWarning() attaches a loud _warning to the response.

async function kpiUmsatzMonat(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: monthStart(now), datum_lte: today(now) },
    { fetchAll: true, skipSlim: true }
  );
  const summe = round2(sumField(result.data, "soll"));
  return withTruncationWarning({
    kpi: "umsatz-monat",
    wert: summe,
    waehrung: "EUR",
    zeitraum: monthLabel(now),
    basis: result.data.length + " Rechnungen",
  }, result.meta);
}

async function kpiUmsatzJahr(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: yearStart(now), datum_lte: today(now) },
    { fetchAll: true, skipSlim: true }
  );
  const summe = round2(sumField(result.data, "soll"));
  return withTruncationWarning({
    kpi: "umsatz-jahr",
    wert: summe,
    waehrung: "EUR",
    zeitraum: String(now.getFullYear()),
    basis: result.data.length + " Rechnungen",
  }, result.meta);
}

async function kpiOffeneAuftraege(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/auftraege",
    { status: "freigegeben" },
    { fetchAll: true, skipSlim: true }
  );
  return withTruncationWarning({
    kpi: "offene-auftraege",
    wert: result.data.length,
    status: "freigegeben",
  }, result.meta);
}

async function kpiOffeneRechnungen(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { status: "freigegeben" },
    { fetchAll: true, skipSlim: true }
  );
  const unbezahlt = result.data.filter((r: any) => {
    const soll = parseFloat(r.soll) || 0;
    const ist = parseFloat(r.ist) || 0;
    return soll > ist;
  });
  const summe = round2(sumField(unbezahlt, "soll") - sumField(unbezahlt, "ist"));
  return withTruncationWarning({
    kpi: "offene-rechnungen",
    anzahl: unbezahlt.length,
    offener_betrag: summe,
    waehrung: "EUR",
  }, result.meta);
}

async function kpiUeberfaelligeRechnungen(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { status: "freigegeben" },
    { fetchAll: true, skipSlim: true }
  );
  const todayStr = localDateString(now);
  const ueberfaellig = result.data.filter((r: any) => {
    const soll = parseFloat(r.soll) || 0;
    const ist = parseFloat(r.ist) || 0;
    if (soll <= ist) return false;
    return isInvoiceOverdue(r, todayStr);
  });
  const summe = round2(sumField(ueberfaellig, "soll") - sumField(ueberfaellig, "ist"));
  return withTruncationWarning({
    kpi: "ueberfaellige-rechnungen",
    anzahl: ueberfaellig.length,
    offener_betrag: summe,
    waehrung: "EUR",
    basis: "datum + zahlungszieltage",
  }, result.meta);
}

async function kpiTopKunde(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/rechnungen",
    { datum_gte: yearStart(now), datum_lte: today(now) },
    { fetchAll: true, skipSlim: true }
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
  return withTruncationWarning({
    kpi: "top-kunde",
    kundennummer: top.kundennummer,
    name: top.name,
    umsatz: round2(top.summe),
    waehrung: "EUR",
    zeitraum: String(now.getFullYear()),
    basis: top.count + " Rechnungen",
  }, result.meta);
}

async function kpiAuftragseingangWoche(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/belege/auftraege",
    { datum_gte: weekStart(now), datum_lte: today(now) },
    { fetchAll: true, skipSlim: true }
  );
  const summe = round2(sumField(result.data, "gesamtsumme"));
  return withTruncationWarning({
    kpi: "auftragseingang-woche",
    anzahl: result.data.length,
    summe,
    waehrung: "EUR",
    zeitraum: "KW ab " + weekStart(now),
  }, result.meta);
}

async function kpiArtikelAnzahl(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/artikel",
    {},
    { fetchAll: true, skipSlim: true }
  );
  const aktiv = result.data.filter((r: any) => String(r.inaktiv || "0") !== "1");
  return withTruncationWarning({
    kpi: "artikel-anzahl",
    wert: aktiv.length,
    gesamt: result.data.length,
  }, result.meta);
}

async function kpiKundenAnzahl(client: OpenXEClient): Promise<Record<string, unknown>> {
  const result = await fetchFilteredList(
    client,
    "/v1/adressen",
    {},
    { fetchAll: true, skipSlim: true, includeDeleted: false }
  );
  const kunden = result.data.filter((a: any) => {
    const knr = String(a.kundennummer || "").trim();
    return knr !== "" && !knr.startsWith("DEL");
  });
  return withTruncationWarning({
    kpi: "kunden-anzahl",
    wert: kunden.length,
    label: "aktive Kunden mit Kundennummer",
  }, result.meta);
}

// --- Procurement KPIs ---
// NOTE: Bestellungen (purchase orders) use the Legacy API, not REST v1.
// We try BelegeList first (efficient), then fall back to iterative BestellungGet.

function withPurchaseOrderWarning(
  payload: Record<string, unknown>,
  truncated: boolean
): Record<string, unknown> {
  if (!truncated) return payload;
  return {
    ...payload,
    _warning:
      `Purchase order scan hit the cap of ${PURCHASE_ORDER_SCAN_CAP} IDs — ` +
      `result is a lower bound.`,
  };
}

async function kpiOffeneBestellungen(client: OpenXEClient): Promise<Record<string, unknown>> {
  const { orders, truncated } = await fetchPurchaseOrdersWithMeta(client);
  const aktiv = orders.filter((r: any) =>
    ["offen", "freigegeben", "bestellt", "angemahnt"].includes(String(r.status || "").toLowerCase())
  );
  const summe = round2(sumField(aktiv, "gesamtsumme"));
  return withPurchaseOrderWarning({
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
  }, truncated);
}

async function kpiBestellvolumenMonat(client: OpenXEClient, now: Date): Promise<Record<string, unknown>> {
  const { orders, truncated } = await fetchPurchaseOrdersWithMeta(client);
  const mStart = monthStart(now);
  const tDay = today(now);
  const monat = orders.filter((r: any) => r.datum && r.datum >= mStart && r.datum <= tDay);
  const summe = round2(sumField(monat, "gesamtsumme"));
  return withPurchaseOrderWarning({
    kpi: "bestellvolumen-monat",
    wert: summe,
    waehrung: "EUR",
    zeitraum: monthLabel(now),
    basis: monat.length + " Bestellungen",
  }, truncated);
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
