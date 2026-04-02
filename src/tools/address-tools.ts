import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient, OpenXEApiError } from "../client/openxe-client.js";
import {
  AddressCreateInput,
  AddressEditInput,
  DeliveryAddressCreateInput,
  DeliveryAddressEditInput,
} from "../schemas/address.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// Normalize common LLM field name mistakes before Zod parsing
export function normalizeAddressFields(input: Record<string, any>): Record<string, any> {
  const normalized = { ...input };

  // Field name mappings (wrong -> correct)
  const fieldMap: Record<string, string | undefined> = {
    'fax': 'telefax',
    'telefaxnummer': 'telefax',
    'handy': 'mobil',
    'mobiltelefon': 'mobil',
    'mobilnummer': 'mobil',
    'webseite': 'internetseite',
    'website': 'internetseite',
    'internet': 'internetseite',
    'homepage': 'internetseite',
    'web': 'internetseite',
    'url': 'internetseite',
    'bank_name': 'bank',
    'bankname': 'bank',
    'bank_inhaber': 'inhaber',
    'kontoinhaber': 'inhaber',
    'kontonummer': 'konto',
    'bic': 'swift',
    'ansprechpartner_name': 'ansprechpartner',
    'kontaktperson': 'ansprechpartner',
    'kontakt': 'ansprechpartner',
    'strasse_nr': 'strasse',
    'hausnummer': undefined, // ignore, part of strasse
    // Document delivery field aliases
    'rechnungsemail': 'rechnungs_email',
    'rechnung_email_cc': 'rechnung_cc',
    'rechnungs_cc': 'rechnung_cc',
    'invoice_email': 'rechnungs_email',
    'invoice_cc': 'rechnung_cc',
    'order_email': 'auftrag_email',
    'order_cc': 'auftrag_cc',
    'quote_email': 'angebot_email',
    'quote_cc': 'angebot_cc',
    // Supplier payment aliases
    'zahlungsweise_lieferant': 'zahlungsweiselieferant',
    'zahlungsziel_lieferant': 'zahlungszieltagelieferant',
    'skonto_lieferant': 'zahlungszielskontolieferant',
    // PayPal aliases
    'paypal_email': 'paypal',
    'paypal_waehrung': 'paypalwaehrung',
    // SEPA aliases
    'sepa_mandatsreferenz': 'mandatsreferenz',
    'sepa_referenz': 'mandatsreferenz',
    'glaeubiger_id': 'glaeubigeridentnr',
    // Misc aliases
    'birthday': 'geburtstag',
    'discount': 'rabatt',
  };

  for (const [wrong, correct] of Object.entries(fieldMap)) {
    if (wrong in normalized && correct && !(correct in normalized)) {
      normalized[correct] = normalized[wrong];
    }
    if (wrong in normalized) {
      delete normalized[wrong];
    }
  }

  // Handle "straße" -> "strasse" (Unicode normalization)
  if ('straße' in normalized && !('strasse' in normalized)) {
    normalized.strasse = normalized['straße'];
    delete normalized['straße'];
  }

  // Handle nested bankverbindung object -> flat fields
  if (normalized.bankverbindung && typeof normalized.bankverbindung === 'object') {
    const bv = normalized.bankverbindung as Record<string, any>;
    if (bv.iban && !normalized.iban) normalized.iban = bv.iban;
    if (bv.swift && !normalized.swift) normalized.swift = bv.swift;
    if (bv.bic && !normalized.swift) normalized.swift = bv.bic;
    if (bv.inhaber && !normalized.inhaber) normalized.inhaber = bv.inhaber;
    if (bv.bankname && !normalized.bank) normalized.bank = bv.bankname;
    if (bv.bank && !normalized.bank) normalized.bank = bv.bank;
    delete normalized.bankverbindung;
  }

  // Remove fields that don't exist in DB (silently dropped, would be ignored anyway)
  const invalidFields = ['hausnummer', 'ansprechposition', 'ansprech_email', 'ansprech_telefon', 'ansprech_fax',
    'lieferadresse_name', 'lieferadresse_strasse', 'lieferadresse_hausnummer', 'lieferadresse_plz',
    'lieferadresse_ort', 'land_lieferung', 'zahlungsbedingungen', 'skonto', 'firma_zusatz'];
  for (const f of invalidFields) {
    delete normalized[f];
  }

  return normalized;
}

export const ADDRESS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-create-address",
    description:
      "Create a new address (customer, supplier, employee) in OpenXE. Uses Legacy API because REST v1 POST is broken. " +
      "Field names are auto-corrected (e.g. fax->telefax, website->internetseite, bic->swift, straße->strasse, nested bankverbindung->flat fields). " +
      "Required: typ, name. " +
      "Optional: vorname, firma, strasse, plz, ort, land, email, telefon, kundennummer (default 'NEU'), projekt, " +
      "telefax, mobil, internetseite, ansprechpartner, abteilung, anrede, titel, adresszusatz, " +
      "iban, swift, inhaber, bank, " +
      "zahlungszieltage, zahlungszieltageskonto, zahlungszielskonto, versandart, steuernummer, sonstiges. " +
      "Document delivery: angebot_email, auftrag_email, rechnungs_email, gutschrift_email, lieferschein_email, bestellung_email (per-doc-type email overrides), " +
      "angebot_cc, auftrag_cc, rechnung_cc, gutschrift_cc, lieferschein_cc, bestellung_cc (CC emails). " +
      "Invoice delivery: rechnung_permail, rechnung_papier, rechnung_anzahlpapier. " +
      "Alt. invoice address: abweichende_rechnungsadresse, rechnung_name/strasse/plz/ort/land/ansprechpartner/email. EDI: gln.",
    inputSchema: zodToJsonSchema(AddressCreateInput) as Record<string, unknown>,
  },
  {
    name: "openxe-edit-address",
    description:
      "Edit an existing address in OpenXE. Tries REST v1 PUT first, falls back to Legacy API if it fails. Required: id. All other address fields are optional.",
    inputSchema: zodToJsonSchema(AddressEditInput) as Record<string, unknown>,
  },
  {
    name: "openxe-create-delivery-address",
    description:
      "Create a delivery address for a customer. Tries REST v1, falls back to Legacy API (REST v1 has a known PHP 8.1 Fatal Error). Required: name, adresse (parent address ID). Optional: typ, strasse, plz, ort, land (2-char ISO), standardlieferadresse (0/1), ust_befreit (0-3).",
    inputSchema: zodToJsonSchema(DeliveryAddressCreateInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-edit-delivery-address",
    description: "Edit an existing delivery address. Required: id.",
    inputSchema: zodToJsonSchema(DeliveryAddressEditInput) as Record<
      string,
      unknown
    >,
  },
  {
    name: "openxe-delete-delivery-address",
    description: "Delete a delivery address by ID.",
    inputSchema: zodToJsonSchema(
      z.object({
        id: z.number().int().positive().describe("Delivery address ID"),
      })
    ) as Record<string, unknown>,
  },
];

export async function handleAddressTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-create-address": {
      const raw = args as Record<string, any>;
      const normalized = normalizeAddressFields(raw);
      const input = AddressCreateInput.parse(normalized);
      // Auto-set lieferantennummer to "NEU" when creating a supplier without explicit number
      if (input.rolle && /lieferant/i.test(input.rolle) && !input.lieferantennummer) {
        input.lieferantennummer = "NEU";
      }
      // Strip 'rolle' — it's a virtual/computed field, not a DB column. Sending it crashes the Legacy API (500).
      const { rolle, ...payload } = input;
      const result = await client.legacyPost("AdresseCreate", payload);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "openxe-edit-address": {
      const raw = args as Record<string, any>;
      const normalized = normalizeAddressFields(raw);
      const input = AddressEditInput.parse(normalized);
      const { id, ...fields } = input;

      // Try REST v1 PUT first (confirmed working via live testing)
      try {
        const restResult = await client.put(`/v1/adressen/${id}`, fields);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  method: "REST v1 PUT /v1/adressen/" + id,
                  data: restResult.data,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const isHttpError =
          err instanceof OpenXEApiError &&
          [400, 404, 500].includes(err.httpCode);
        if (!isHttpError) throw err;

        // Fall back to Legacy API
        const legacyResult = await client.legacyPost("AdresseEdit", {
          adresse: input,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  method: "Legacy API POST /api/AdresseEdit (fallback)",
                  reason: `REST v1 PUT returned ${(err as OpenXEApiError).httpCode}`,
                  data: legacyResult.data ?? legacyResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    case "openxe-create-delivery-address": {
      const input = DeliveryAddressCreateInput.parse(args);
      try {
        // Try REST v1 first
        const result = await client.post("/v1/lieferadressen", input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (e) {
        // Fallback to Legacy API (REST v1 has PHP 8.1 Fatal Error on DeliveryAddressResource)
        const result = await client.legacyPost("LieferadresseCreate", input);
        const data =
          typeof result.data === "object" && result.data !== null
            ? result.data
            : {};
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ...data, _method: "legacy-fallback" },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    case "openxe-edit-delivery-address": {
      const input = DeliveryAddressEditInput.parse(args);
      const { id, ...fields } = input;
      const result = await client.put(`/v1/lieferadressen/${id}`, fields);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }

    case "openxe-delete-delivery-address": {
      const { id } = z
        .object({ id: z.number().int().positive() })
        .parse(args);
      await client.delete(`/v1/lieferadressen/${id}`);
      return {
        content: [
          {
            type: "text",
            text: `Delivery address ${id} deleted successfully.`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}
