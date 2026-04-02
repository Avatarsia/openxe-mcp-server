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

export const ADDRESS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-create-address",
    description:
      "Create a new address (customer, supplier, employee) in OpenXE. Uses Legacy API because REST v1 POST is broken. Required: typ, name. Optional: vorname, firma, strasse, plz, ort, land, email, telefon, kundennummer (default 'NEU' = auto-generate next number), projekt.",
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
      const input = AddressCreateInput.parse(args);
      // Auto-set lieferantennummer to "NEU" when creating a supplier without explicit number
      if (input.rolle && /lieferant/i.test(input.rolle) && !input.lieferantennummer) {
        input.lieferantennummer = "NEU";
      }
      const result = await client.legacyPost("AdresseCreate", input);
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
      const input = AddressEditInput.parse(args);
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
