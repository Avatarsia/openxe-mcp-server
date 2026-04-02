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
  };
}

export function applyWhere(records: any[], where: WhereClause): any[] {
  return records.filter(record => {
    for (const [field, conditions] of Object.entries(where)) {
      const value = String(record[field] ?? "");
      const numValue = parseFloat(value);
      
      for (const [op, target] of Object.entries(conditions)) {
        switch(op) {
          case "equals": if (value !== String(target)) return false; break;
          case "contains": if (!value.toLowerCase().includes(String(target).toLowerCase())) return false; break;
          case "startsWith": if (!value.startsWith(String(target))) return false; break;
          case "endsWith": if (!value.endsWith(String(target))) return false; break;
          case "gt": if (numValue <= Number(target)) return false; break;
          case "lt": if (numValue >= Number(target)) return false; break;
          case "gte": if (numValue < Number(target)) return false; break;
          case "lte": if (numValue > Number(target)) return false; break;
          case "range": if (value < String(target[0]) || value > String(target[1])) return false; break;
          case "empty": if (target === true && value !== "") return false; if (target === false && value === "") return false; break;
          case "notEmpty": if (target === true && value === "") return false; break;
        }
      }
    }
    return true;
  });
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
    filter: records => records.filter(r => {
      if (r.zahlungsstatus === "bezahlt" || !r.belegnr) return false;
      const diff = (Date.now() - new Date(r.datum).getTime()) / 86400000;
      return diff > 30;
    }),
    defaultFields: ["id", "belegnr", "name", "datum", "soll", "ist", "zahlungsstatus"],
    description: "Rechnungen ueber 30 Tage unbezahlt"
  },
  "entwuerfe": {
    entity: "invoices",
    filter: records => records.filter(r => !r.belegnr || r.belegnr === "" || r.status === "angelegt"),
    defaultFields: ["id", "name", "datum", "soll", "status"],
    description: "Nicht freigegebene Rechnungsentwuerfe"
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

export function formatAsCsv(records: any[], fields?: string[]): string {
  if (records.length === 0) return "";
  const cols = fields || Object.keys(records[0]);
  const header = cols.join(";");
  const rows = records.map(r => cols.map(c => {
    const v = String(r[c] ?? "");
    return v.includes(";") || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(";"));
  return [header, ...rows].join("\n");
}

export function formatAsIds(records: any[]): string {
  return records.map(r => r.id).filter(Boolean).join(",");
}

// --- Zeitraum (date range) shortcuts ---

const MONTH_NAMES: Record<string, number> = {
  januar: 0, februar: 1, maerz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
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
