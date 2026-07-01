import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient, OpenXEApiError } from "../client/openxe-client.js";
import {
  OrderCreateInput,
  QuoteCreateInput,
  InvoiceCreateInput,
  CreditNoteCreateInput,
  DocumentIdInput,
  BelegPDFInput,
  EditOrderInput,
  EditInvoiceInput,
  EditQuoteInput,
  EditDeliveryNoteInput,
  EditCreditMemoInput,
} from "../schemas/document.js";

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

export const DOCUMENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // === Create ===
  {
    name: "openxe-create-order",
    description:
      "Create a sales order (Auftrag) via Legacy API. Required: adresse (customer ID), positionen (line items with nummer + menge; preis optional). " +
      "Optional: datum, projekt, zahlungsweise, lieferbedingung, freitext, internebezeichnung, versandart, waehrung, lieferdatum. " +
      "Do NOT pass kundennummer — the server resolves it automatically from the address. " +
      "Do NOT include bezeichnung on positions (breaks PDF rendering; the system uses the article master data). " +
      "If the address has no kundennummer set, the call fails with a clear error — fix the address via openxe-edit-address first. " +
      "Workflow: create-order -> openxe-convert-order-to-invoice creates linked invoice + delivery note.",
    inputSchema: zodToJsonSchema(OrderCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-quote",
    description:
      "Create a quote (Angebot) via Legacy API. Required: adresse (customer ID), positionen [{nummer, menge, preis?}]. Optional: datum, gueltigbis, freitext, internebezeichnung. " +
      "Do NOT pass kundennummer (server resolves it from the address) and do NOT set bezeichnung on positions. " +
      "Address must already have a kundennummer, otherwise the call fails with a clear error.",
    inputSchema: zodToJsonSchema(QuoteCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-invoice",
    description:
      "Create a standalone invoice (Rechnung) via Legacy API. For order-linked invoices, prefer openxe-convert-order-to-invoice instead. " +
      "Required: adresse (customer ID), positionen [{nummer, menge, preis}] — preis is mandatory. Optional: datum, zahlungsweise, zahlungszieltage, freitext, internebezeichnung. " +
      "Do NOT pass kundennummer (auto-resolved from the address) and do NOT set bezeichnung on positions. " +
      "Address must have a kundennummer or the call fails.",
    inputSchema: zodToJsonSchema(InvoiceCreateInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-create-credit-note",
    description:
      "Create a credit note (Gutschrift). Required: adresse (customer ID), positionen [{nummer, menge, preis}]. Optional: rechnungid to link to an existing invoice. " +
      "Do NOT pass kundennummer (auto-resolved from the address) and do NOT set bezeichnung on positions. " +
      "Address must have a kundennummer.",
    inputSchema: zodToJsonSchema(CreditNoteCreateInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },

  // === Workflow ===
  {
    name: "openxe-convert-quote-to-order",
    description:
      "Convert an existing quote (Angebot) to a sales order (Auftrag). Required: id (quote ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-convert-order-to-invoice",
    description:
      "Convert a sales order to a linked invoice + delivery note via WeiterfuehrenAuftragZuRechnung. This is the standard workflow — creates invoice and delivery note in one step. Required: id (order ID).",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-release-order",
    description:
      "Release/approve a sales order for processing. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-release-invoice",
    description: "Release/finalize an invoice. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-mark-invoice-paid",
    description: "Mark an invoice as paid. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-delete-draft-invoice",
    description:
      "Delete a DRAFT invoice (only works if belegnr is empty or '0'). Cascades to positions and protocol entries. Required: id.",
    inputSchema: zodToJsonSchema(DocumentIdInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },

  // === Edit ===
  {
    name: "openxe-edit-order",
    description:
      "Auftrag bearbeiten via Legacy API (AuftragEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, lieferbedingung, freitext, internebezeichnung, versandart, lieferdatum.",
    inputSchema: zodToJsonSchema(EditOrderInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-invoice",
    description:
      "Rechnung bearbeiten via Legacy API (RechnungEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, zahlungszieltage, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditInvoiceInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-quote",
    description:
      "Angebot bearbeiten via Legacy API (AngebotEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, gueltigbis, projekt, zahlungsweise, lieferbedingung, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditQuoteInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-delivery-note",
    description:
      "Lieferschein bearbeiten via Legacy API (LieferscheinEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, versandart, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditDeliveryNoteInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-edit-credit-memo",
    description:
      "Gutschrift bearbeiten via Legacy API (GutschriftEdit). Aendert Kopffelder — Positionen koennen nach Erstellung nicht geaendert werden. Required: id. Optional: datum, projekt, zahlungsweise, freitext, internebezeichnung.",
    inputSchema: zodToJsonSchema(EditCreditMemoInput) as Record<
      string,
      unknown
    >,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  // === PDF ===
  {
    name: "openxe-get-document-pdf",
    description:
      "Get any document as PDF (base64 encoded). Required: typ (angebot|auftrag|rechnung|lieferschein|gutschrift|bestellung), id.",
    inputSchema: zodToJsonSchema(BelegPDFInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const LEGACY_ACTION_MAP: Record<string, string> = {
  "openxe-create-order": "AuftragCreate",
  "openxe-create-quote": "AngebotCreate",
  "openxe-create-invoice": "RechnungCreate",
  "openxe-create-credit-note": "GutschriftCreate",
  "openxe-convert-quote-to-order": "AngebotZuAuftrag",
  "openxe-convert-order-to-invoice": "WeiterfuehrenAuftragZuRechnung",
  "openxe-release-order": "AuftragFreigabe",
  "openxe-release-invoice": "RechnungFreigabe",
  "openxe-mark-invoice-paid": "RechnungAlsBezahltMarkieren",
  "openxe-edit-order": "AuftragEdit",
  "openxe-edit-invoice": "RechnungEdit",
  "openxe-edit-quote": "AngebotEdit",
  "openxe-edit-delivery-note": "LieferscheinEdit",
  "openxe-edit-credit-memo": "GutschriftEdit",
};

/**
 * JSON wrapper key per Legacy endpoint.
 * OpenXE Legacy API expects some endpoints to receive data wrapped in an
 * entity-named key, e.g. {"auftrag": {...fields...}}.
 * Endpoints with `null` use flat JSON (no wrapper).
 */
const LEGACY_WRAPPER_KEY: Record<string, string | null> = {
  // Create endpoints send a FLAT payload (no entity wrapper). Adding a
  // {"auftrag": {...}} wrapper causes OpenXE to throw 7499.
  // Live-verified 2026-04-10 against OpenXE v1.12.
  "openxe-create-order": null,
  "openxe-create-quote": null,
  "openxe-create-invoice": null,
  "openxe-create-credit-note": null,
  "openxe-convert-quote-to-order": null,
  "openxe-convert-order-to-invoice": null,
  "openxe-release-order": null,
  "openxe-release-invoice": null,
  "openxe-mark-invoice-paid": null,
  "openxe-edit-order": "auftrag",
  "openxe-edit-invoice": "rechnung",
  "openxe-edit-quote": "angebot",
  "openxe-edit-delivery-note": "lieferschein",
  "openxe-edit-credit-memo": "gutschrift",
};

const CREATE_TOOLS_WITH_POSITIONS = new Set([
  "openxe-create-order",
  "openxe-create-quote",
  "openxe-create-invoice",
  "openxe-create-credit-note",
]);

const SCHEMA_MAP: Record<string, z.ZodSchema> = {
  "openxe-create-order": OrderCreateInput,
  "openxe-create-quote": QuoteCreateInput,
  "openxe-create-invoice": InvoiceCreateInput,
  "openxe-create-credit-note": CreditNoteCreateInput,
  "openxe-convert-quote-to-order": DocumentIdInput,
  "openxe-convert-order-to-invoice": DocumentIdInput,
  "openxe-release-order": DocumentIdInput,
  "openxe-release-invoice": DocumentIdInput,
  "openxe-mark-invoice-paid": DocumentIdInput,
  "openxe-edit-order": EditOrderInput,
  "openxe-edit-invoice": EditInvoiceInput,
  "openxe-edit-quote": EditQuoteInput,
  "openxe-edit-delivery-note": EditDeliveryNoteInput,
  "openxe-edit-credit-memo": EditCreditMemoInput,
};

// ---------------------------------------------------------------------------
// Idempotency guard + post-create verification (OpenXE issue #18)
//
// OpenXE's ApiBelegCreate persists the document row BEFORE the follow-up steps
// and runs without a DB transaction. If a later step throws, the API returns
// 7499 "Unexpected error" but the document already exists (orphan). A client
// that treats 7499 as a plain failure and retries creates one extra document
// per attempt (observed: 10 quotes from a single logical action).
//
// Two client-side mitigations, since we cannot patch the server here:
//   1. Idempotency cache: an identical create within IDEM_TTL_MS returns the
//      first result instead of creating a duplicate.
//   2. Post-error verification: on ANY OpenXEApiError from a create, we check
//      whether the document actually landed and return a DEFINITIVE outcome
//      that never invites a blind retry.
// ---------------------------------------------------------------------------

const IDEM_TTL_MS = 120_000;

interface CacheEntry {
  ts: number;
  result: ToolResult;
}

const createCache = new Map<string, CacheEntry>();

/** Stable-ish key for a create intent (fixed field order — no sorting needed). */
function buildIdemKey(toolName: string, data: Record<string, unknown>): string {
  return (
    toolName +
    "|" +
    JSON.stringify({
      adresse: data.adresse,
      kundennummer: data.kundennummer,
      rechnungid: data.rechnungid,
      auftragid: data.auftragid,
      artikelliste: data.artikelliste,
    })
  );
}

function getCachedCreate(key: string): ToolResult | null {
  const e = createCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > IDEM_TTL_MS) {
    createCache.delete(key);
    return null;
  }
  return e.result;
}

function putCachedCreate(key: string, result: ToolResult): void {
  createCache.set(key, { ts: Date.now(), result });
}

/** Reset the idempotency cache — used by tests. */
export function resetIdempotencyCache(): void {
  createCache.clear();
}

/** Append an extra text note to a (cached) result without mutating the original. */
function withNote(result: ToolResult, note: string): ToolResult {
  return {
    ...result,
    content: [...result.content, { type: "text" as const, text: note }],
  };
}

/** REST v1 belege sub-path + list-action label per create tool, for verification. */
const CREATE_VERIFY: Record<string, { path: string; listAction: string }> = {
  "openxe-create-order": { path: "auftraege", listAction: "list-orders" },
  "openxe-create-quote": { path: "angebote", listAction: "list-quotes" },
  "openxe-create-invoice": { path: "rechnungen", listAction: "list-invoices" },
  "openxe-create-credit-note": { path: "gutschriften", listAction: "list-credit-memos" },
};

const VERIFY_WINDOW_MS = 5 * 60_000;

/** Parse OpenXE "YYYY-MM-DD HH:MM:SS" (or date only) to epoch ms; null if unparseable. */
function parseOpenXETs(s: unknown): number | null {
  if (typeof s !== "string" || s.trim() === "" || s.startsWith("0000")) return null;
  const ms = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
}

type VerifyOutcome =
  | { status: "created"; id: string; belegnr: string; count: number }
  | { status: "none" }
  | { status: "unknown" };

/**
 * After a create error, check whether a document for this kundennummer was
 * created within the last VERIFY_WINDOW_MS. Best-effort: any lookup failure
 * degrades to "unknown" (caller then warns instead of asserting).
 */
async function verifyBelegCreated(
  client: OpenXEClient,
  toolName: string,
  kundennummer: string
): Promise<VerifyOutcome> {
  const cfg = CREATE_VERIFY[toolName];
  if (!cfg || !kundennummer) return { status: "unknown" };
  try {
    const resp = await client.get<any>(`/v1/belege/${cfg.path}`, { kundennummer });
    const raw = resp.data;
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
    const now = Date.now();
    const recent = list
      .filter((r) => String(r?.kundennummer ?? "") === String(kundennummer))
      .map((r) => ({
        r,
        ts: parseOpenXETs(
          r?.created_at ?? r?.updated_at ?? (r?.datum ? `${r.datum} ${r?.zeit ?? "00:00:00"}` : "")
        ),
      }))
      .filter((x) => x.ts !== null && now - (x.ts as number) <= VERIFY_WINDOW_MS)
      .sort((a, b) => Number(b.r.id) - Number(a.r.id) || (b.ts as number) - (a.ts as number));

    if (recent.length > 0) {
      const b = recent[0].r;
      return {
        status: "created",
        id: String(b.id),
        belegnr: String(b.belegnr ?? ""),
        count: recent.length,
      };
    }
    return { status: "none" };
  } catch {
    return { status: "unknown" };
  }
}

export async function handleDocumentTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  // Special case: delete draft invoice uses REST v1 DELETE
  if (toolName === "openxe-delete-draft-invoice") {
    const { id } = DocumentIdInput.parse(args);
    await client.delete(`/v1/belege/rechnungen/${id}`);
    return {
      content: [
        {
          type: "text",
          text: `Draft invoice ${id} deleted successfully (positions and protocol entries cascaded).`,
        },
      ],
    };
  }

  // Special case: BelegPDF uses GET params and returns binary PDF
  if (toolName === "openxe-get-document-pdf") {
    const input = BelegPDFInput.parse(args);
    const result = await client.getRaw("/BelegPDF", {
      beleg: input.typ,
      id: String(input.id),
    });
    const base64 = result.data.toString("base64");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              filename: `${input.typ}-${input.id}.pdf`,
              content_type: result.contentType,
              size_bytes: result.data.length,
              base64: base64,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // All other document tools use Legacy API
  const action = LEGACY_ACTION_MAP[toolName];
  const schema = SCHEMA_MAP[toolName];

  if (!action || !schema) {
    return {
      content: [{ type: "text", text: `Unknown document tool: ${toolName}` }],
      isError: true,
    };
  }

  const input = schema.parse(args);

  let data: Record<string, unknown> = input as Record<string, unknown>;

  // Create endpoints (AuftragCreate, AngebotCreate, RechnungCreate,
  // GutschriftCreate) need three transformations that were live-verified
  // against OpenXE v1.12 on 2026-04-10:
  //   1. Positions must be nested as artikelliste.position (not flat positionen)
  //   2. kundennummer must be included (address ID alone is not enough)
  //   3. No entity wrapper (handled via LEGACY_WRAPPER_KEY = null above)
  // Any of these missing causes a server-side uncaught exception (error 7499).
  if (CREATE_TOOLS_WITH_POSITIONS.has(toolName)) {
    if (Array.isArray(data.positionen)) {
      const { positionen, ...rest } = data;
      data = { ...rest, artikelliste: { position: positionen } };
    }

    // Auto-populate kundennummer from the address, unless the caller already
    // provided one. We fetch /v1/adressen/{id} and use its kundennummer.
    if (!data.kundennummer && typeof data.adresse === "number") {
      const addrResp = await client.get<any>(`/v1/adressen/${data.adresse}`);
      // OpenXE wraps list/single responses as {data: {...}, pagination}, so
      // the actual address object lives one level deeper.
      const addr = (addrResp.data?.data ?? addrResp.data) as Record<string, unknown> | undefined;
      const kn = addr?.kundennummer;
      if (!kn || String(kn).trim() === "") {
        return {
          content: [
            {
              type: "text",
              text:
                `Cannot create document: address ${data.adresse} has no kundennummer. ` +
                `OpenXE requires a customer number on the address before it can be used ` +
                `on a sales document. Set one via openxe-edit-address and try again.`,
            },
          ],
          isError: true,
        };
      }
      data = { ...data, kundennummer: String(kn) };
    }
  }

  // Wrap data in entity key if required by this endpoint
  const wrapperKey = LEGACY_WRAPPER_KEY[toolName];
  const payload =
    wrapperKey != null
      ? { [wrapperKey]: data }
      : data;

  const isCreate = CREATE_TOOLS_WITH_POSITIONS.has(toolName);

  // Non-create tools: pass through unchanged.
  if (!isCreate) {
    const result = await client.legacyPost(action, payload);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  // --- Create path (idempotency + post-error verification, issue #18) ---
  const idemKey = buildIdemKey(toolName, data);
  const cached = getCachedCreate(idemKey);
  if (cached) {
    return withNote(
      cached,
      `Idempotenz: identischer ${toolName} wurde in den letzten ${IDEM_TTL_MS / 1000}s bereits ausgefuehrt — es wurde KEIN neuer Beleg angelegt.`
    );
  }

  const kn =
    typeof data.kundennummer === "string"
      ? data.kundennummer
      : String(data.kundennummer ?? "");

  try {
    const result = await client.legacyPost(action, payload);
    const ok: ToolResult = {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
    putCachedCreate(idemKey, ok);
    return ok;
  } catch (err) {
    // Network / non-API errors: not our concern here.
    if (!(err instanceof OpenXEApiError)) throw err;

    const cfg = CREATE_VERIFY[toolName];
    const outcome = await verifyBelegCreated(client, toolName, kn);

    if (outcome.status === "created") {
      const dupWarn =
        outcome.count > 1
          ? ` ACHTUNG: ${outcome.count} kuerzlich fuer diese Kundennummer angelegte Belege gefunden — moegliche Duplikate, bitte pruefen.`
          : "";
      const res: ToolResult = {
        content: [
          {
            type: "text",
            text:
              `⚠ Beleg wurde TROTZ Server-Fehler ${err.code} ("${err.message}") angelegt: ` +
              `belegnr ${outcome.belegnr} (id ${outcome.id}).${dupWarn} ` +
              `NICHT erneut versuchen — der Fehler ist ein bekannter OpenXE-Bug ` +
              `(github.com/Avatarsia/OpenXE/issues/18), der Beleg existiert.`,
          },
        ],
      };
      // Cache so an immediate identical retry is deduped instead of duplicating.
      putCachedCreate(idemKey, res);
      return res;
    }

    if (outcome.status === "none") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `create fehlgeschlagen (OpenXE ${err.code}: "${err.message}") und KEIN Beleg fuer ` +
              `kundennummer ${kn} gefunden. Ursache serverseitig — pruefe die Kunden-Pflichtfelder ` +
              `(z.B. Steuer/USt-Konfiguration). NICHT identisch wiederholen (Duplikat-Risiko, Bug #18).`,
          },
        ],
      };
    }

    // status === "unknown": could not verify — must not invite a blind retry.
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            `create meldete Fehler (OpenXE ${err.code}: "${err.message}") und der Beleg-Status ` +
            `konnte NICHT verifiziert werden. MOEGLICHERWEISE wurde trotzdem ein Beleg angelegt. ` +
            `Erst per ${cfg?.listAction ?? "list-*"} (kundennummer=${kn}) pruefen, dann gezielt ` +
            `fortfahren — NICHT blind wiederholen (Bug #18).`,
        },
      ],
    };
  }
}
