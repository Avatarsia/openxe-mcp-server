import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";

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

/**
 * OpenXE 1.13 REST v1 has no POST /v1/artikel and no PUT /v1/artikel/{id}
 * (both routes are commented out in ApiApplication.php). Article writes
 * therefore use the Legacy actions ArtikelCreate and ArtikelEdit. They are
 * the only Legacy writes in this server; they are kept here so the rest of
 * the server stays on REST.
 *
 * Purchase prices (einkaufspreise) are nested sections of ArtikelCreate and
 * ArtikelEdit. Those nested sections need the OpenXE fix in www/pages/api.php
 * (skip nested sections in the field loop). Without the fix both actions
 * fail with a 500 "Unknown column" error.
 *
 * Two behaviours depend on a patched www/pages/api.php that exists only in the
 * test install (127.0.0.1:8081), not in stock OpenXE 1.13 and not in production
 * (https://javela.539565.xyz):
 *  - the Legacy action ArtikelEinkaufspreisDelete (openxe-delete-article-purchase-price);
 *  - the rename via URL lookup (openxe-update-article with neue_nummer), where the
 *    article is found by the URL parameter nummer and the new number is in the body.
 * This repo does not contain that patch. Production has neither, so these calls
 * fail there and must not be used against production.
 *
 * The Legacy layer puts values into SQL strings without escaping them. The
 * schemas below therefore reject quotes, backslashes and control characters
 * in free text. The proper fix belongs in OpenXE (escaping in ApiArtikelEdit
 * and AddEinkaufspreis) and is not part of this server.
 */
const ARTIKELKATEGORIE_TYP_EXT: Record<string, string> = {
  handelsware: "1",
};

/*
 * Patterns are written once and used both for the zod runtime check and for
 * the JSON schema. Each one also accepts surrounding whitespace, because the
 * runtime trims input before it matches. So schema and runtime agree.
 */
/* Control characters: C0 (U+0000-U+001F), DEL and C1 (U+007F-U+009F). */
const NON_SPACE_CHAR = String.raw`[^\s'"\\\u0000-\u001f\u007f-\u009f]`;
const MID_CHAR = String.raw`[^'"\\\u0000-\u001f\u007f-\u009f]`;
const TEXT_CORE = String.raw`${NON_SPACE_CHAR}(?:${MID_CHAR}*${NON_SPACE_CHAR})?`;
/** Non-empty free text without quotes, backslashes or control characters. */
const SAFE_TEXT_REQUIRED = new RegExp(String.raw`^\s*${TEXT_CORE}\s*$`);
/** Free text that may be empty or whitespace only (create skips it). */
const SAFE_TEXT_OPTIONAL = new RegExp(String.raw`^\s*(?:${TEXT_CORE})?\s*$`);
const COUNTRY_CREATE = new RegExp(String.raw`^\s*(?:[A-Za-z]{2})?\s*$`);
const COUNTRY_UPDATE = new RegExp(String.raw`^\s*[A-Za-z]{2}\s*$`);
const CURRENCY_CODE = new RegExp(String.raw`^\s*[A-Za-z]{3}\s*$`);
const LEGACY_UNSAFE_MESSAGE =
  "must not contain ' \" \\ or control characters: the OpenXE Legacy API does not escape them. Rephrase, or use a typographic apostrophe (U+2019), which changes the stored text.";

/** Formats a number without exponent notation, e.g. 1e-7 becomes "0.0000001". */
export function plainNumber(n: number): string {
  // -0 === 0, so this also turns negative zero into "0" instead of "-0".
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** True when the formatted number parses back to the same value, i.e. nothing is rounded away. */
const keepsValue = (n: number) => Number(plainNumber(n)) === n;
const KEEPS_VALUE_MESSAGE = "value cannot be sent without rounding (too many decimal places)";

/** OpenXE column scales: einkaufspreise.preis is decimal(18,8), ab_menge is decimal(14,4). Larger scales are rounded silently by the database. */
const maxDecimals = (max: number) => (n: number) => (plainNumber(n).split(".")[1] ?? "").length <= max;

/** HS / customs tariff code: 6 to 10 digits, surrounding whitespace allowed (trimmed before matching). */
const HS_CODE = new RegExp(String.raw`^\s*\d{6,10}\s*$`);
const hsCodeText = (label: string) =>
  z.string().trim().regex(HS_CODE, { message: `${label} must be 6 to 10 digits, e.g. 82032000` });

const requiredText = (label?: string) =>
  z
    .string()
    .trim()
    .min(1, label ? `${label} must not be empty` : "must not be empty")
    .regex(SAFE_TEXT_REQUIRED, { message: LEGACY_UNSAFE_MESSAGE });

/** Free text that may be empty; empty values are skipped on create. */
const optionalText = () => z.string().trim().regex(SAFE_TEXT_OPTIONAL, { message: LEGACY_UNSAFE_MESSAGE });

/** JSON Schema patterns have no flags, so case-insensitivity is spelled out per letter. */
const caseInsensitive = (s: string) =>
  s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const CATEGORY_PATTERN = new RegExp(
  String.raw`^\s*([1-9]\d*|${Object.keys(ARTIKELKATEGORIE_TYP_EXT).map(caseInsensitive).join("|")})\s*$`
);

/** One regex only: the category pattern already excludes quotes and backslashes. Two regexes would make the JSON schema use allOf. */
const categoryText = () =>
  z.string().trim().min(1, "artikelkategorie must not be empty").regex(CATEGORY_PATTERN, {
    message: "artikelkategorie must be a known name (e.g. 'Handelsware') or a numeric category id",
  });

/** Country code for create: empty is skipped, otherwise exactly two letters. */
const countryTextOptional = () =>
  z
    .string()
    .trim()
    .regex(COUNTRY_CREATE, { message: "herkunftsland must be an ISO 3166-1 alpha-2 code, e.g. CH" });

export const PurchasePriceInput = z.object({
  preis: z
    .number()
    .finite()
    .nonnegative()
    .refine(keepsValue, { message: KEEPS_VALUE_MESSAGE })
    .refine(maxDecimals(8), { message: "preis allows at most 8 decimal places (OpenXE column scale)" })
    .describe("Purchase price per unit, at most 8 decimal places. Plain decimal number. Values with too many decimal places to be sent exactly are rejected at runtime, which the JSON schema cannot express."),
  waehrung: z
    .string()
    .trim()
    .regex(CURRENCY_CODE, { message: "waehrung must be a 3-letter code, e.g. CHF" })
    .describe(
      "Currency code, required, e.g. CHF or EUR. OpenXE treats an empty currency as EUR, so pass the currency of the existing prices explicitly; a missing currency would otherwise create a parallel price row."
    ),
  ab_menge: z
    .number()
    .finite()
    .positive()
    .refine(keepsValue, { message: KEEPS_VALUE_MESSAGE })
    .refine(maxDecimals(4), { message: "ab_menge allows at most 4 decimal places (OpenXE column scale)" })
    .default(1)
    .describe("Minimum quantity for this price (default 1)"),
  lieferantennummer: optionalText()
    .optional()
    .describe("Supplier number. Lookup order: first by this number, then by lieferantname."),
  lieferantname: requiredText("lieferantname").describe(
    "Supplier name, required. Used for lookup if no supplier has lieferantennummer. If neither matches, a supplier with this name is created and gets lieferantennummer. An existing supplier found by name is not given the number."
  ),
  bestellnummer: requiredText("bestellnummer").describe(
    "Supplier's article number, required. Every call writes it, so a repeated call without it would erase the stored value."
  ),
  bezeichnunglieferant: optionalText()
    .optional()
    .describe("Article name as the supplier uses it. Empty or missing: the article name is used."),
});

/** NEW and NEU make OpenXE generate the next number, so they are not accepted as an article number on create. */
const RESERVED_NUMBERS = ["new", "neu"].map(caseInsensitive).join("|");
const ARTICLE_NUMBER_CREATE = new RegExp(
  String.raw`^(?!\s*(?:${RESERVED_NUMBERS})\s*$)\s*${TEXT_CORE}\s*$`
);

export const ArticleCreateInput = z.object({
  nummer: z
    .string()
    .trim()
    .min(1, "nummer must not be empty")
    .regex(ARTICLE_NUMBER_CREATE, {
      message: "nummer must be a text without quotes or control characters, and NEW/NEU are reserved for OpenXE number generation",
    })
    .describe("Article number, e.g. 1K102. Set by you, not generated by the ERP. NEW and NEU are not allowed."),
  name_de: requiredText("name_de").describe("Article name (German)"),
  artikelkategorie: categoryText().describe(
    "Article category. Known names: 'Handelsware'. Or pass the numeric category id as a string. The id is not checked against OpenXE here; an id that does not exist can make the server fail."
  ),
  standardlieferant: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Address ID of the standard supplier (stored on the article as adresse)."),
  // Optional text fields may be empty on create; empty values are skipped.
  hersteller: optionalText().optional().describe("Manufacturer name"),
  herstellernummer: optionalText().optional().describe("Manufacturer article number"),
  ean: optionalText().optional().describe("EAN / GTIN"),
  zolltarifnummer: hsCodeText("zolltarifnummer").optional().describe("Customs tariff number (HS code), 6 to 10 digits, e.g. 82032000"),
  herkunftsland: countryTextOptional()
    .optional()
    .describe("Country of origin, ISO 3166-1 alpha-2 (e.g. CH). Empty is skipped."),
  lagerartikel: z.boolean().optional().describe("Stocked item (true) or not (false)"),
  einkaufspreis: PurchasePriceInput.optional().describe(
    "Purchase price from a supplier. lieferantname and bestellnummer are required (a lieferantennummer alone is not enough). The supplier is looked up by lieferantennummer, then by lieferantname, and created by name if neither matches. The name lookup does not check the supplier role, so a customer with the same name can match, and an existing match does not get the lieferantennummer. bezeichnunglieferant defaults to the article name. Requires the OpenXE fix for nested sections in ArtikelCreate."
  ),
});

/**
 * Sales prices (Verkaufspreise) sent with an article write. OpenXE expires every sales price
 * that is not sent in the same call, so pass the ones to keep here.
 */
const SalesPriceItem = z.object({
  ab_menge: z
    .number()
    .finite()
    .positive()
    .refine(keepsValue, { message: "ab_menge must be representable exactly as a plain decimal" })
    .refine(maxDecimals(4), { message: "ab_menge allows at most 4 decimal places (OpenXE column scale)" })
    .describe("Minimum quantity from which the price applies, e.g. 1"),
  preis: z
    .number()
    .finite()
    .nonnegative()
    .refine(keepsValue, { message: "preis must be representable exactly as a plain decimal" })
    .refine(maxDecimals(8), { message: "preis allows at most 8 decimal places (OpenXE column scale)" })
    .describe("Sales price per unit"),
  waehrung: z
    .string()
    .trim()
    .regex(CURRENCY_CODE, { message: "waehrung must be a 3-letter currency code, e.g. CHF" })
    .describe("Currency, ISO 4217, e.g. CHF"),
});
const SalesPricesInput = z.array(SalesPriceItem).min(1).max(50);

/**
 * Update base shape. Text fields must be non-empty: an empty string would
 * overwrite the stored value with "", so it is rejected instead.
 */
const ArticleUpdateBase = z.object({
  nummer: requiredText("nummer").describe(
    "Article number of the article to change. Identifies the article; it is not renamed."
  ),
  name_de: requiredText("name_de").optional().describe("New article name (German)"),
  artikelkategorie: categoryText()
    .optional()
    .describe("New article category. Known names: 'Handelsware'. Or the numeric category id as a string. The id is not checked against OpenXE here; an id that does not exist can make the server fail."),
  standardlieferant: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Address ID of the standard supplier (stored on the article as adresse)."),
  hersteller: requiredText("hersteller").optional().describe("Manufacturer name"),
  herstellernummer: requiredText("herstellernummer").optional().describe("Manufacturer article number"),
  ean: requiredText("ean").optional().describe("EAN / GTIN"),
  neue_nummer: requiredText("neue_nummer").optional().describe(
    "New article number. The article is found by nummer and then renamed to neue_nummer. Must not already exist."
  ),
  zolltarifnummer: hsCodeText("zolltarifnummer").optional().describe("Customs tariff number (HS code), 6 to 10 digits, e.g. 82032000"),
  herkunftsland: z
    .string()
    .trim()
    .regex(COUNTRY_UPDATE, "herkunftsland must be an ISO 3166-1 alpha-2 code, e.g. CH")
    .optional()
    .describe("Country of origin, ISO 3166-1 alpha-2 (e.g. CH)"),
  lagerartikel: z.boolean().optional().describe("Stocked item (true) or not (false)"),
  verkaufspreise: SalesPricesInput.optional().describe(
    "Sales prices to keep on the article. Send them with every write, because OpenXE expires sales prices that are not sent in the same call."
  ),
});

export const ArticleUpdateInput = ArticleUpdateBase.refine(
  (a) => Object.entries(a).some(([k, v]) => k !== "nummer" && v !== undefined),
  { message: "openxe-update-article needs at least one field to change besides nummer" }
);

/**
 * The standalone tool has no article name to fall back on, so the supplier's
 * article description is required here (an empty value would be replaced by
 * the article name on the server).
 */
export const ArticlePurchasePriceInput = z.object({
  nummer: requiredText("nummer").describe("Article number of the existing article that gets the purchase price."),
  einkaufspreis: PurchasePriceInput.extend({
    bezeichnunglieferant: requiredText("bezeichnunglieferant").describe(
      "Article name as the supplier uses it, required on this tool. Every call writes it."
    ),
  }),
  verkaufspreise: SalesPricesInput.optional().describe(
    "Sales prices to keep. This call expires sales prices that are not sent, so send the ones to keep."
  ),
});

export const ArticlePurchasePriceDeleteInput = z.object({
  nummer: requiredText("nummer").describe("Article number whose purchase rows are removed."),
  lieferantennummer: requiredText("lieferantennummer").describe(
    "Supplier number (Lieferantennummer) of the rows to remove, e.g. 70004. Rows of other suppliers are not touched."
  ),
  // Non-empty when given: an empty value would silently widen the delete to every row of the supplier.
  bestellnummer: requiredText("bestellnummer")
    .optional()
    .describe("Optional: remove only the rows with this supplier article number. Omit it to remove all rows of this supplier; an empty value is rejected."),
});

export const ArticleDeleteInput = z.object({
  nummer: requiredText("nummer").describe("Article number of the article to delete (soft delete)."),
});

export const ARTICLE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-create-article",
    description:
      "Create an article in OpenXE. Uses the Legacy API action ArtikelCreate (REST v1 has no article POST in OpenXE 1.13). " +
      "Required: name_de, nummer, artikelkategorie. Optional: standardlieferant (address ID), hersteller, herstellernummer, ean, zolltarifnummer, herkunftsland, lagerartikel, einkaufspreis. " +
      "Empty optional text fields are skipped. Text must not contain ' \" \\ or control characters (OpenXE does not escape them); rephrase, or use a typographic apostrophe (U+2019), which changes the stored text. " +
      "Without confirm: true the call only returns a dry-run preview and writes nothing.",
    inputSchema: zodToJsonSchema(
      ArticleCreateInput.extend({
        confirm: z.boolean().optional().describe("Must be true to create. Without it the call only returns a dry-run preview."),
      })
    ) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "openxe-update-article",
    description:
      "Change fields of an existing article, identified by nummer. Uses the Legacy API action ArtikelEdit (REST v1 has no article PUT in OpenXE 1.13). " +
      "Only the fields you pass are changed; at least one field besides nummer is required. The server looks up nummer without excluding deleted articles, so make sure the article is live before changing it. Empty strings are rejected (they would clear the stored value). " +
      "neue_nummer renames the article: it is found by nummer (sent as URL parameter) and the new number is written from the body. This rename depends on the patched api.php of the test install only; stock OpenXE and production do not support it. " +
      "Side effect: the OpenXE call also expires the article's sales prices (Verkaufspreise) that are not sent in the same call, even when you change only text fields. " +
      "Text must not contain ' \" \\ or control characters (OpenXE does not escape them); rephrase, or use a typographic apostrophe (U+2019), which changes the stored text. " +
      "Without confirm: true the call only returns a dry-run preview and writes nothing. " +
      "To set a purchase price use openxe-add-article-purchase-price.",
    inputSchema: {
      ...(zodToJsonSchema(
        ArticleUpdateBase.extend({
          confirm: z.boolean().optional().describe("Must be true to change the article. Without it the call only returns a dry-run preview."),
        })
      ) as Record<string, unknown>),
      anyOf: Object.keys(ArticleUpdateBase.shape)
        .filter((k) => k !== "nummer")
        .map((k) => ({ required: [k] })),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-delete-article",
    description:
      "Delete an article by nummer. This is a soft delete: OpenXE sets geloescht=1 on the article row and keeps it in the database (the UI has no hard delete either). " +
      "Uses the Legacy action ArtikelEdit with geloescht=1. The lookup by nummer does not exclude deleted articles, so deleting an already deleted article is a no-op. " +
      "Side effect: the OpenXE call also expires the sales prices (Verkaufspreise) of the article. Purchase prices (Einkaufspreise) stay, so remove them first with openxe-delete-article-purchase-price if they must not remain. " +
      "Without confirm: true the call only returns a dry-run preview and deletes nothing.",
    inputSchema: zodToJsonSchema(
      ArticleDeleteInput.extend({
        confirm: z.boolean().optional().describe("Must be true to delete. Without it the call only returns a dry-run preview."),
      })
    ) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-delete-article-purchase-price",
    description:
      "Remove the purchase prices (Einkaufspreise) of one supplier from one article. Identify the article by nummer and the supplier by lieferantennummer; optionally narrow to one bestellnummer. " +
      "Rows are marked as deleted (geloescht=1) and expire yesterday, the same as the delete button in the OpenXE UI. Other suppliers are not touched. " +
      "Uses the Legacy action ArtikelEinkaufspreisDelete. That action exists only in the patched api.php of the test OpenXE install; stock OpenXE 1.13 and production do not have it, so the call fails there. " +
      "Without confirm: true the call only returns a dry-run preview and deletes nothing.",
    inputSchema: zodToJsonSchema(
      ArticlePurchasePriceDeleteInput.extend({
        confirm: z.boolean().optional().describe("Must be true to delete. Without it the call only returns a dry-run preview."),
      })
    ) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-add-article-purchase-price",
    description:
      "Set a purchase price (Einkaufspreis) on an existing article, identified by nummer. Uses the Legacy API action ArtikelEdit with a nested einkaufspreise section. " +
      "Needs the OpenXE fix for nested sections. lieferantname, bestellnummer and bezeichnunglieferant are required. " +
      "Every call writes bestellnummer and bezeichnunglieferant for the given supplier and quantity. " +
      "If the price differs from the current one, the current price is invalidated and the new one is inserted. If it is the same, the price itself changes nothing, but the supplier article number is still overwritten with the value you pass. " +
      "Other purchase prices (Einkaufspreise) are kept. Sales prices (Verkaufspreise) that are not sent are expired by the OpenXE call, as with openxe-update-article. The supplier is looked up by lieferantennummer, then by lieferantname; only if neither matches is a new supplier created. The name lookup does not check the supplier role, so a customer with the same name can match, and an existing match does not get the lieferantennummer. " +
      "Retrying with a different price creates another version each time, so check the current price first (openxe-get-article with includeEinkaufspreise). " +
      "Without confirm: true the call only returns a dry-run preview and writes nothing.",
    inputSchema: zodToJsonSchema(
      ArticlePurchasePriceInput.extend({
        confirm: z.boolean().optional().describe("Must be true to write the price. Without it the call only returns a dry-run preview."),
      })
    ) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

export function articleTypExt(artikelkategorie: string): string {
  const key = artikelkategorie.trim().toLowerCase();
  return ARTIKELKATEGORIE_TYP_EXT[key] ?? artikelkategorie.trim();
}

/** Builds the Legacy einkaufspreise section for one purchase price. */
export function buildPurchasePricePayload(
  p: z.infer<typeof PurchasePriceInput>,
  defaultBezeichnung = ""
): Record<string, unknown> {
  return {
    staffelpreis: {
      ab_menge: plainNumber(p.ab_menge),
      preis: plainNumber(p.preis),
      waehrung: p.waehrung.toUpperCase(),
      lieferantennummer: p.lieferantennummer ?? "",
      lieferantname: p.lieferantname,
      bestellnummer: p.bestellnummer,
      bezeichnunglieferant: p.bezeichnunglieferant || defaultBezeichnung,
    },
  };
}

/**
 * Maps the optional article fields to Legacy field names. Only fields that are
 * set and non-empty are included, so an empty value never overwrites data.
 */
function buildOptionalArticleFields(input: {
  standardlieferant?: number;
  hersteller?: string;
  herstellernummer?: string;
  ean?: string;
  zolltarifnummer?: string;
  herkunftsland?: string;
  lagerartikel?: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.standardlieferant !== undefined) payload.adresse = String(input.standardlieferant);
  if (input.hersteller?.trim()) payload.hersteller = input.hersteller.trim();
  if (input.herstellernummer?.trim()) payload.herstellernummer = input.herstellernummer.trim();
  if (input.ean?.trim()) payload.ean = input.ean.trim();
  if (input.zolltarifnummer?.trim()) payload.zolltarifnummer = input.zolltarifnummer.trim();
  if (input.herkunftsland?.trim()) payload.herkunftsland = input.herkunftsland.trim().toUpperCase();
  if (input.lagerartikel !== undefined) payload.lagerartikel = input.lagerartikel ? "1" : "0";
  return payload;
}

export function buildArticlePayload(input: z.infer<typeof ArticleCreateInput>): Record<string, unknown> {
  const name = input.name_de.trim();
  const payload: Record<string, unknown> = {
    name_de: name,
    nummer: input.nummer.trim(),
    typ_ext: articleTypExt(input.artikelkategorie),
    ...buildOptionalArticleFields(input),
  };
  if (input.einkaufspreis) {
    payload.einkaufspreise = buildPurchasePricePayload(input.einkaufspreis, name);
  }
  return payload;
}

function buildSalesPricePayload(items: z.infer<typeof SalesPricesInput>): Record<string, unknown> {
  const rows = items.map((p) => ({
    ab_menge: plainNumber(p.ab_menge),
    preis: plainNumber(p.preis),
    waehrung: p.waehrung.trim().toUpperCase(),
  }));
  return { staffelpreis: rows.length === 1 ? rows[0] : rows };
}

export function buildArticleUpdatePayload(input: z.infer<typeof ArticleUpdateInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = { nummer: input.nummer.trim() };
  if (input.name_de !== undefined) payload.name_de = input.name_de.trim();
  if (input.artikelkategorie !== undefined) payload.typ_ext = articleTypExt(input.artikelkategorie);
  if (input.verkaufspreise !== undefined) payload.verkaufspreise = buildSalesPricePayload(input.verkaufspreise);
  return { ...payload, ...buildOptionalArticleFields(input) };
}

export function buildArticlePurchasePricePayload(input: z.infer<typeof ArticlePurchasePriceInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nummer: input.nummer.trim(),
    einkaufspreise: buildPurchasePricePayload(input.einkaufspreis),
  };
  if (input.verkaufspreise !== undefined) payload.verkaufspreise = buildSalesPricePayload(input.verkaufspreise);
  return payload;
}

function dryRunResult(transport: string, message: string, payload: Record<string, unknown>): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ dry_run: true, message, transport, would_send: payload }, null, 2),
      },
    ],
  };
}

function writeResult(result: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export async function handleArticleTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  const raw = { ...(args as Record<string, unknown>) };
  const confirm = raw.confirm === true;
  delete raw.confirm;

  switch (toolName) {
    case "openxe-create-article": {
      const input = ArticleCreateInput.parse(raw);
      const payload = buildArticlePayload(input);
      if (!confirm) {
        return dryRunResult(
          "Legacy API ArtikelCreate (no REST route for articles in OpenXE 1.13)",
          "Nothing was created. Repeat the call with confirm: true to create this article.",
          payload
        );
      }
      return writeResult(await client.legacyPost("ArtikelCreate", payload));
    }

    case "openxe-update-article": {
      const input = ArticleUpdateInput.parse(raw);
      const payload = buildArticleUpdatePayload(input);
      // Rename: OpenXE finds the article by the URL parameter nummer and writes the new nummer from the body.
      const query = input.neue_nummer !== undefined ? { nummer: input.nummer.trim() } : undefined;
      if (input.neue_nummer !== undefined) payload.nummer = input.neue_nummer.trim();
      if (!confirm) {
        return dryRunResult(
          "Legacy API ArtikelEdit (no REST route for article PUT in OpenXE 1.13)" + (query ? ", rename via URL lookup" : ""),
          "Nothing was changed. Repeat the call with confirm: true to change this article. Warning: the OpenXE call also expires sales prices (Verkaufspreise) of this article that are not sent, even for text-only changes.",
          { ...payload, ...(query ? { lookup_query: query } : {}) }
        );
      }
      return writeResult(query ? await client.legacyPost("ArtikelEdit", payload, query) : await client.legacyPost("ArtikelEdit", payload));
    }

    case "openxe-add-article-purchase-price": {
      const input = ArticlePurchasePriceInput.parse(raw);
      const payload = buildArticlePurchasePricePayload(input);
      if (!confirm) {
        return dryRunResult(
          "Legacy API ArtikelEdit with nested einkaufspreise (needs the OpenXE nested-section fix)",
          "Nothing was written. Repeat the call with confirm: true to set this purchase price. For the same supplier, quantity and currency, a different price invalidates the current one and adds a new version. The same price changes nothing except bestellnummer and bezeichnunglieferant, which are overwritten. Warning: the OpenXE call also expires sales prices (Verkaufspreise) of this article that are not sent.",
          payload
        );
      }
      return writeResult(await client.legacyPost("ArtikelEdit", payload));
    }

    case "openxe-delete-article-purchase-price": {
      const input = ArticlePurchasePriceDeleteInput.parse(raw);
      const payload: Record<string, unknown> = {
        nummer: input.nummer.trim(),
        lieferantennummer: input.lieferantennummer.trim(),
      };
      if (input.bestellnummer) payload.bestellnummer = input.bestellnummer.trim();
      if (!confirm) {
        return dryRunResult(
          "Legacy API ArtikelEinkaufspreisDelete (provided by the test OpenXE install)",
          "Nothing was deleted. Repeat the call with confirm: true to remove the matching purchase rows of this supplier.",
          payload
        );
      }
      return writeResult(await client.legacyPost("ArtikelEinkaufspreisDelete", payload));
    }

    case "openxe-delete-article": {
      const input = ArticleDeleteInput.parse(raw);
      const payload = { nummer: input.nummer.trim(), geloescht: "1" };
      if (!confirm) {
        return dryRunResult(
          "Legacy API ArtikelEdit with geloescht=1 (soft delete)",
          "Nothing was deleted. Repeat the call with confirm: true to soft-delete this article. Purchase prices stay on the row; sales prices are expired.",
          payload
        );
      }
      return writeResult(await client.legacyPost("ArtikelEdit", payload));
    }

    default:
      throw new Error(`Unknown article tool: ${toolName}`);
  }
}
