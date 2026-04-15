import { localDateString } from "./local-date.js";
import { isInvoiceOverdue } from "./invoice-aging.js";

export interface WhereClause {
  [field: string]: {
    equals?: string | number;
    contains?: string;
    startsWith?: string;
    endsWith?: string;
    gt?: number | string;
    lt?: number | string;
    gte?: number | string;
    lte?: number | string;
    range?: [string, string];
    empty?: boolean;
    notEmpty?: boolean;
    in?: (string | number)[];
    containsAny?: (string | number)[];
    containsAll?: (string | number)[];
  };
}

/**
 * Resolve a dot-notation path against a record. If the path traverses an
 * array, the remaining path is applied to every array element and the leaf
 * values are flattened into a single array.
 *
 * Examples:
 *   resolvePath({a: {b: 1}}, "a.b")                  -> 1
 *   resolvePath({pos: [{n: "A"}, {n: "B"}]}, "pos.n") -> ["A", "B"]
 *   resolvePath({pos: []}, "pos.n")                   -> []
 *   resolvePath({}, "pos.n")                          -> undefined
 */
export function resolvePath(record: any, path: string): any {
  if (!path.includes(".")) return record?.[path];
  const parts = path.split(".");
  let current: any = record;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    const part = parts[i];
    if (Array.isArray(current)) {
      const remaining = parts.slice(i).join(".");
      const collected: any[] = [];
      for (const el of current) {
        const sub = resolvePath(el, remaining);
        if (Array.isArray(sub)) collected.push(...sub);
        else if (sub !== undefined) collected.push(sub);
      }
      return collected;
    }
    current = current[part];
  }
  return current;
}

/**
 * Test a set of string values against a single operator. Values array
 * semantics: "matches if at least one element satisfies the condition"
 * (except for `empty`, which requires all elements to be empty).
 */
function matchOperator(values: string[], numValues: number[], op: string, target: any): boolean {
  switch (op) {
    case "equals":
      return values.some(v => v === String(target));
    case "contains": {
      const t = String(target).toLowerCase();
      return values.some(v => v.toLowerCase().includes(t));
    }
    case "startsWith":
      return values.some(v => v.startsWith(String(target)));
    case "endsWith":
      return values.some(v => v.endsWith(String(target)));
    case "gt":
      return numValues.some(n => !isNaN(n) && n > Number(target));
    case "lt":
      return numValues.some(n => !isNaN(n) && n < Number(target));
    case "gte":
      return numValues.some(n => !isNaN(n) && n >= Number(target));
    case "lte":
      return numValues.some(n => !isNaN(n) && n <= Number(target));
    case "range": {
      const arr = target as [string, string];
      return values.some(v => v >= String(arr[0]) && v <= String(arr[1]));
    }
    case "empty":
      if (target === true) return values.length === 0 || values.every(v => v === "");
      if (target === false) return values.some(v => v !== "");
      return true;
    case "notEmpty":
      if (target === true) return values.some(v => v !== "");
      return true;
    case "in": {
      const list = (target as (string | number)[]).map(t => String(t).toLowerCase());
      if (list.length === 0) return false;
      return values.some(v => list.includes(v.toLowerCase()));
    }
    case "containsAny": {
      const list = (target as (string | number)[]).map(t => String(t).toLowerCase());
      if (list.length === 0) return false;
      const lowerValues = values.map(v => v.toLowerCase());
      return list.some(t => lowerValues.includes(t));
    }
    case "containsAll": {
      const list = (target as (string | number)[]).map(t => String(t).toLowerCase());
      if (list.length === 0) return true;
      const lowerValues = values.map(v => v.toLowerCase());
      return list.every(t => lowerValues.includes(t));
    }
  }
  return true;
}

/**
 * Evaluate a where-condition block against a single resolved value-list.
 * `raw` is the result of resolvePath (may be array, scalar, or undefined).
 */
function evalConditions(raw: any, conditions: Record<string, any>): boolean {
  const rawValues: any[] = Array.isArray(raw) ? raw : [raw];
  const values = rawValues.map(v => String(v ?? ""));
  // For empty arrays keep `values` empty; for scalars we always get 1 entry.
  const effectiveValues = Array.isArray(raw) && raw.length === 0 ? [] : values;
  const numValues = effectiveValues.map(v => parseFloat(v));
  for (const [op, target] of Object.entries(conditions)) {
    if (!matchOperator(effectiveValues, numValues, op, target)) return false;
  }
  return true;
}

/**
 * Partition where-entries into a structured form once, independent of the
 * record set. Each entry is pre-parsed into its first path segment (`prefix`)
 * and the remaining dot-notation (`rest`). `prefix` is null when the field has
 * no dot — such clauses are always evaluated as scalar via resolvePath.
 *
 * This is called once per applyWhere invocation; the per-record filter loop
 * only needs to check Array.isArray(record[prefix]) to decide branching,
 * avoiding re-allocating the parsed structure for every record (relevant at
 * 1000+ records).
 */
interface ParsedWhereEntry {
  field: string;
  conditions: any;
  prefix: string | null;
  rest: string;
}

function partitionWhereEntries(where: WhereClause): ParsedWhereEntry[] {
  const result: ParsedWhereEntry[] = [];
  for (const [field, conditions] of Object.entries(where)) {
    const dot = field.indexOf(".");
    if (dot > 0) {
      result.push({
        field,
        conditions,
        prefix: field.slice(0, dot),
        rest: field.slice(dot + 1),
      });
    } else {
      result.push({ field, conditions, prefix: null, rest: "" });
    }
  }
  return result;
}

/**
 * Apply a where-clause to a set of records.
 *
 * Semantics:
 *   - Scalar clauses (no dot, or prefix that is not an array on the record)
 *     are evaluated via resolvePath against the whole record.
 *   - Array-prefix clauses (first path segment is an array on the record) are
 *     grouped by prefix. A group with 2+ clauses is evaluated element-wise:
 *     at least one array element must satisfy ALL clauses of the group
 *     simultaneously (elem-match / correlated-AND). A group with exactly one
 *     clause keeps the legacy any-match semantics via resolvePath (which
 *     flattens leaves across array elements).
 *
 * Limitation:
 *   elem-match grouping considers ONLY the first path segment as the array
 *   prefix. For deeper nested arrays (e.g. `positionen.historie.datum`),
 *   grouping happens at the `positionen` level; inside a position element the
 *   original resolvePath-flatten semantics apply. True 2nd-level elem-match
 *   would require a recursive pass and is currently out of scope.
 */
export function applyWhere(records: any[], where: WhereClause): any[] {
  // Parse where-entries ONCE — shape is record-independent.
  const parsed = partitionWhereEntries(where);

  return records.filter(record => {
    // Group entries by their array-prefix (first path segment that points to
    // an array in THIS record). Correlated conditions on e.g.
    // `positionen.nummer` and `positionen.menge` must target the SAME
    // position, not any two positions across the array.
    const arrayPrefixGroups: Map<string, ParsedWhereEntry[]> = new Map();
    const scalarEntries: ParsedWhereEntry[] = [];

    for (const p of parsed) {
      if (p.prefix !== null && Array.isArray(record?.[p.prefix])) {
        if (!arrayPrefixGroups.has(p.prefix)) arrayPrefixGroups.set(p.prefix, []);
        arrayPrefixGroups.get(p.prefix)!.push(p);
      } else {
        scalarEntries.push(p);
      }
    }

    // Scalar / non-array-prefix clauses: unchanged behavior.
    for (const p of scalarEntries) {
      if (!evalConditions(resolvePath(record, p.field), p.conditions)) return false;
    }

    // Array-prefix groups:
    //   - single clause: 1 clause keeps any-match semantics for backward-compat (resolvePath flattens).
    //   - 2+ clauses: element-wise AND — at least one element must satisfy
    //     ALL clauses simultaneously.
    for (const [prefix, group] of arrayPrefixGroups) {
      if (group.length === 1) {
        const g = group[0];
        if (!evalConditions(resolvePath(record, g.field), g.conditions)) return false;
      } else {
        const arr: any[] = record[prefix];
        const someElementMatches = arr.some(el =>
          group.every(g => evalConditions(resolvePath(el, g.rest), g.conditions))
        );
        if (!someElementMatches) return false;
      }
    }
    return true;
  });
}

/**
 * Filter a single-level array of elements by where-clauses whose keys start
 * with `${arrayField}.`. Each surviving element must satisfy ALL matching
 * clauses (evaluated on the element itself using the `rest` path).
 *
 * Where-keys that do NOT start with `${arrayField}.` are ignored — they were
 * meant for the parent record, not for array elements.
 *
 * Keys whose full path equals `${arrayField}` (without a dot) are also ignored —
 * this helper only filters by per-element sub-paths. Use `applyWhere` on the
 * parent record for whole-array checks like `empty`/`notEmpty`.
 *
 * Returns a new array; input is not mutated.
 */
export function filterArrayElementsByWhere(
  array: any[],
  where: WhereClause,
  arrayField: string
): any[] {
  const prefix = `${arrayField}.`;
  const relevant = partitionWhereEntries(where).filter(p => p.field.startsWith(prefix));
  if (relevant.length === 0) return array;
  return array.filter(el =>
    relevant.every(p => evalConditions(resolvePath(el, p.rest), p.conditions))
  );
}

export function applySort(records: any[], sort: {field: string, order?: "asc"|"desc"}): any[] {
  const {field, order = "asc"} = sort;
  return [...records].sort((a, b) => {
    const va = a[field] ?? "";
    const vb = b[field] ?? "";
    const numA = parseFloat(va), numB = parseFloat(vb);
    let cmp: number;
    if (!isNaN(numA) && !isNaN(numB)) cmp = numA - numB;
    else cmp = String(va).localeCompare(String(vb));
    return order === "desc" ? -cmp : cmp;
  });
}

export function applyLimit(records: any[], limit: number): any[] {
  return records.slice(0, limit);
}

export function pickFields(record: any, fields: string[]): any {
  const result: any = {};
  for (const f of fields) if (f in record) result[f] = record[f];
  return result;
}

export function applyFields(records: any[], fields: string[]): any[] {
  return records.map(r => pickFields(r, fields));
}

// --- Aggregation ---

export type AggregateOp =
  | "count"
  | { sum: string }
  | { avg: string }
  | { min: string }
  | { max: string }
  | { groupBy: string; count?: boolean; sum?: string };

export function applyAggregate(records: any[], op: AggregateOp): any {
  if (op === "count") return { count: records.length };

  if (typeof op === "object") {
    // groupBy must be checked first because it can also contain "sum"
    if ("groupBy" in op) {
      const groups: Record<string, any> = {};
      for (const r of records) {
        const key = String(r[op.groupBy] || "(leer)");
        if (!groups[key]) groups[key] = { count: 0, sum: 0 };
        groups[key].count++;
        if (op.sum) groups[key].sum += parseFloat(r[op.sum]) || 0;
      }
      // Round sums
      for (const k of Object.keys(groups)) {
        groups[k].sum = Math.round(groups[k].sum * 100) / 100;
        if (!op.sum) delete groups[k].sum;
      }
      return { groupBy: op.groupBy, groups };
    }
    if ("sum" in op && typeof op.sum === "string") {
      const total = records.reduce((s, r) => s + (parseFloat(r[op.sum as string]) || 0), 0);
      return { sum: Math.round(total * 100) / 100, field: op.sum, count: records.length };
    }
    if ("avg" in op && typeof op.avg === "string") {
      const total = records.reduce((s, r) => s + (parseFloat(r[op.avg as string]) || 0), 0);
      return { avg: records.length ? Math.round((total / records.length) * 100) / 100 : 0, field: op.avg, count: records.length };
    }
    if ("min" in op && typeof op.min === "string") {
      const vals = records.map(r => parseFloat(r[op.min as string]) || 0);
      return { min: Math.min(...vals), field: op.min };
    }
    if ("max" in op && typeof op.max === "string") {
      const vals = records.map(r => parseFloat(r[op.max as string]) || 0);
      return { max: Math.max(...vals), field: op.max };
    }
  }
  return { error: "Unknown aggregate operation" };
}

/**
 * Pre-built business query presets for common ERP queries.
 *
 * Each preset maps to an entity type, a client-side filter function,
 * and a set of default fields to return in the response.
 */
export const BUSINESS_PRESETS: Record<string, {
  entity: string;
  filter: (records: any[]) => any[];
  defaultFields: string[];
  description: string;
}> = {
  "nicht-versendet": {
    entity: "orders",
    filter: records => records.filter(r => r.status === "freigegeben"),
    defaultFields: ["id", "belegnr", "name", "kundennummer", "datum", "gesamtsumme", "status"],
    description: "Auftraege die freigegeben aber noch nicht versendet wurden"
  },
  "ohne-tracking": {
    entity: "delivery-notes",
    filter: records => records, // all delivery notes (tracking check would need cross-entity)
    defaultFields: ["id", "belegnr", "name", "datum", "status", "versandart"],
    description: "Lieferscheine (Tracking muss separat geprueft werden)"
  },
  "offene-rechnungen": {
    entity: "invoices",
    filter: records => records.filter(r => r.zahlungsstatus !== "bezahlt" && r.belegnr),
    defaultFields: ["id", "belegnr", "name", "datum", "soll", "ist", "zahlungsstatus"],
    description: "Unbezahlte Rechnungen mit Belegnummer"
  },
  "ueberfaellige-rechnungen": {
    entity: "invoices",
    filter: records => {
      const today = localDateString(new Date());
      return records.filter(r => {
        if (r.zahlungsstatus === "bezahlt" || !r.belegnr) return false;
        return isInvoiceOverdue(r, today);
      });
    },
    defaultFields: ["id", "belegnr", "name", "datum", "zahlungszieltage", "soll", "ist", "zahlungsstatus"],
    description: "Rechnungen mit ueberschrittenem Faelligkeitsdatum (datum + zahlungszieltage)"
  },
  "entwuerfe": {
    entity: "invoices",
    filter: records => records.filter(r => !r.belegnr || r.belegnr === "" || r.status === "angelegt"),
    defaultFields: ["id", "name", "datum", "soll", "status"],
    description: "Nicht freigegebene Rechnungsentwuerfe"
  },
  "offene-bestellungen": {
    entity: "purchaseOrders",
    filter: records => records.filter(r => ["offen", "freigegeben", "bestellt", "angemahnt"].includes(r.status)),
    defaultFields: ["id", "belegnr", "name", "lieferantennummer", "datum", "lieferdatum", "gesamtsumme", "status"],
    description: "Nicht abgeschlossene Bestellungen"
  },
  "ueberfaellige-lieferungen": {
    entity: "purchaseOrders",
    filter: records => {
      const today = localDateString(new Date());
      return records.filter(r => {
        if (r.status !== "bestellt") return false;
        if (!r.lieferdatum) return false;
        const lieferdatum = String(r.lieferdatum).slice(0, 10);
        // OpenXE emits "0000-00-00" as a placeholder for "no real delivery
        // date set". Same guard as in handleProcurementReport: treat only
        // lexically positive calendar days as real.
        if (lieferdatum <= "0000-00-00") return false;
        // Calendar-day comparison via YYYY-MM-DD string compare:
        // avoids the intra-day flip that `new Date(...) < new Date()` had.
        return lieferdatum < today;
      });
    },
    defaultFields: ["id", "belegnr", "name", "lieferantennummer", "datum", "lieferdatum", "gesamtsumme", "status"],
    description: "Bestellungen mit ueberschrittenem Lieferdatum"
  },
};

// --- Output format helpers ---

export function formatAsTable(records: any[], fields?: string[]): string {
  if (records.length === 0) return "(keine Ergebnisse)";
  const cols = fields || Object.keys(records[0]);
  const header = cols.join(" | ");
  const separator = cols.map(c => "-".repeat(Math.max(c.length, 6))).join("-|-");
  const rows = records.map(r => cols.map(c => String(r[c] ?? "")).join(" | "));
  return [header, separator, ...rows].join("\n");
}

function csvEscape(value: any): string {
  const v = String(value ?? "");
  // RFC 4180: quote on delimiter, quote char, or embedded line breaks.
  // Multi-line fields like article `beschreibung` must be quoted or CSV
  // importers (Excel, LibreOffice) split the row on the embedded newline.
  const needsQuote = v.includes(";") || v.includes('"') || v.includes("\n") || v.includes("\r");
  return needsQuote ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function formatAsCsv(records: any[], fields?: string[]): string {
  if (records.length === 0) return "";
  const cols = fields || Object.keys(records[0]);
  const header = cols.join(";");
  const rows = records.map(r => cols.map(c => csvEscape(r[c])).join(";"));
  return [header, ...rows].join("\n");
}

export function formatAsIds(records: any[]): string {
  return records.map(r => r.id).filter(Boolean).join(",");
}

/**
 * Explode belege (invoices/orders/delivery-notes/quotes/credit-memos) to one
 * CSV row per position. Each row is prefixed with selected header fields of
 * the parent record, followed by selected fields of the position.
 *
 * Records whose positionsField is missing, not an array, or empty are skipped.
 * Returns an empty string for an empty records array. Quoting/escaping rules
 * match formatAsCsv (semicolon delimiter, quote on ; or ", escape " as "").
 */
export function formatAsCsvPositions(
  records: any[],
  positionsField: string,
  headerFields: string[],
  positionFields: string[]
): string {
  if (records.length === 0) return "";
  const header = [...headerFields, ...positionFields].join(";");
  const rows: string[] = [];
  for (const record of records) {
    const positions = record?.[positionsField];
    if (!Array.isArray(positions) || positions.length === 0) continue;
    const prefix = headerFields.map(f => csvEscape(record[f]));
    for (const position of positions) {
      const posCols = positionFields.map(f => csvEscape(position?.[f]));
      rows.push([...prefix, ...posCols].join(";"));
    }
  }
  return [header, ...rows].join("\n");
}

// --- Zeitraum (date range) shortcuts ---

const MONTH_NAMES: Record<string, number> = {
  januar: 0, februar: 1, maerz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};

function fmtDate(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Parse a German-language date range shortcut into { von, bis } ISO date strings.
 *
 * Supported formats:
 *   heute, diese-woche, dieser-monat, letzter-monat,
 *   letzte-7-tage, letzte-30-tage, letzte-90-tage,
 *   oktober-2025  (month-year),
 *   Q3-2025        (quarter-year),
 *   2025           (full year)
 */
export function parseZeitraum(zeitraum: string): { von: string; bis: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (zeitraum.toLowerCase()) {
    case "heute":
      return { von: fmtDate(now), bis: fmtDate(now) };
    case "diese-woche": {
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { von: fmtDate(mon), bis: fmtDate(sun) };
    }
    case "dieser-monat":
      return {
        von: `${year}-${String(month + 1).padStart(2, "0")}-01`,
        bis: fmtDate(new Date(year, month + 1, 0)),
      };
    case "letzter-monat":
      return {
        von: fmtDate(new Date(year, month - 1, 1)),
        bis: fmtDate(new Date(year, month, 0)),
      };
    case "letzte-7-tage": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { von: fmtDate(d), bis: fmtDate(now) };
    }
    case "letzte-30-tage": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { von: fmtDate(d), bis: fmtDate(now) };
    }
    case "letzte-90-tage": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { von: fmtDate(d), bis: fmtDate(now) };
    }
    default: {
      const monthMatch = zeitraum.match(
        /^(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)-(\d{4})$/i
      );
      if (monthMatch) {
        const m = MONTH_NAMES[monthMatch[1].toLowerCase()];
        const y = parseInt(monthMatch[2]);
        return { von: fmtDate(new Date(y, m, 1)), bis: fmtDate(new Date(y, m + 1, 0)) };
      }
      const qMatch = zeitraum.match(/^Q([1-4])-(\d{4})$/i);
      if (qMatch) {
        const q = parseInt(qMatch[1]);
        const y = parseInt(qMatch[2]);
        return {
          von: fmtDate(new Date(y, (q - 1) * 3, 1)),
          bis: fmtDate(new Date(y, q * 3, 0)),
        };
      }
      const yearMatch = zeitraum.match(/^(\d{4})$/);
      if (yearMatch) {
        const y = parseInt(yearMatch[1]);
        return { von: `${y}-01-01`, bis: `${y}-12-31` };
      }
      throw new Error(`Unbekannter Zeitraum: ${zeitraum}`);
    }
  }
}

// --- Status Presets ---

/**
 * Per-entity status filter presets. Each entry maps a preset name to a
 * filter function that accepts a single record and returns true/false.
 */
export const STATUS_PRESETS: Record<string, Record<string, (record: any) => boolean>> = {
  orders: {
    offen: (r) => r.status === "freigegeben",
    entwurf: (r) => r.status === "angelegt" || !r.belegnr || r.belegnr === "",
  },
  invoices: {
    offen: (r) => r.zahlungsstatus !== "bezahlt",
    unbezahlt: (r) => r.zahlungsstatus !== "bezahlt",
    bezahlt: (r) => r.zahlungsstatus === "bezahlt",
    ueberfaellig: (r) => {
      if (r.zahlungsstatus === "bezahlt") return false;
      const today = localDateString(new Date());
      return isInvoiceOverdue(r, today);
    },
    entwurf: (r) => !r.belegnr || r.belegnr === "" || r.belegnr === null || r.status === "angelegt",
    mahnkandidaten: (r) => {
      // Semantics: a dunning candidate is an invoice that SHOULD be dunned:
      // unpaid AND not mahnwesen-locked AND past its real due date
      // (datum + zahlungszieltage). The previous "14 days after invoice date"
      // magic ignored zahlungszieltage and fired too early for customers with
      // longer payment terms.
      if (r.zahlungsstatus === "bezahlt") return false;
      if (String(r.mahnwesen_gesperrt || "0") === "1") return false;
      const today = localDateString(new Date());
      return isInvoiceOverdue(r, today);
    },
  },
  quotes: {
    offen: (r) => r.status === "freigegeben" || r.status === "angelegt",
    angenommen: (r) => r.status === "beauftragt",
    abgelehnt: (r) => r.status === "abgelehnt",
  },
  purchaseOrders: {
    offen: (r) => r.status === "offen",
    freigegeben: (r) => r.status === "freigegeben",
    bestellt: (r) => r.status === "bestellt",
    angemahnt: (r) => r.status === "angemahnt",
    empfangen: (r) => r.status === "empfangen",
    aktiv: (r) => ["offen", "freigegeben", "bestellt", "angemahnt"].includes(r.status),
  },
};

/**
 * Apply a status preset filter to a set of records.
 * Returns all records unchanged if entity or preset is unknown.
 */
export function applyStatusPreset(records: any[], entity: string, preset: string): any[] {
  const entityPresets = STATUS_PRESETS[entity];
  if (!entityPresets) return records;
  const filterFn = entityPresets[preset];
  if (!filterFn) return records;
  return records.filter(filterFn);
}

/**
 * Return the list of status_preset names registered for an entity,
 * or an empty list if the entity is unknown. Useful for callers that
 * want to validate user input up-front instead of silently ignoring
 * unknown presets.
 */
export function getStatusPresetNames(entity: string): string[] {
  const entityPresets = STATUS_PRESETS[entity];
  return entityPresets ? Object.keys(entityPresets) : [];
}
