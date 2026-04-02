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
