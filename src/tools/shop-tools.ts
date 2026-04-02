import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OpenXEClient } from "../client/openxe-client.js";

// --- Input Schemas ---

const EmptyInput = z.object({}).describe("No parameters required");

const ArticleNumberInput = z.object({
  articlenumber: z
    .string()
    .describe(
      "Article number (plain text — will be base64-encoded automatically for the URL)"
    ),
});

const OrderNumberInput = z.object({
  ordernumber: z
    .string()
    .describe(
      "Order number (plain text — will be base64-encoded automatically for the URL)"
    ),
});

const RefundInput = z.object({
  order_id: z.union([z.string(), z.number()]).optional().describe("Order ID"),
  amount: z.number().optional().describe("Refund amount"),
  reason: z.string().optional().describe("Refund reason"),
  positions: z
    .array(z.record(z.unknown()))
    .optional()
    .describe("Line items to refund"),
});

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

// --- Tool Definitions ---

export const SHOP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "openxe-shop-status",
    description:
      "Check if the shop connection is active. GET /shopimport/status. Does not require an active shop.",
    inputSchema: zodToJsonSchema(EmptyInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-auth",
    description:
      "Authenticate / test the shop connection via RemoteConnection. POST /shopimport/auth.",
    inputSchema: zodToJsonSchema(EmptyInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-sync-stock",
    description:
      "Sync stock/storage for a single article to the shop. POST /shopimport/syncstorage/{articlenumber}. Article number is base64-encoded in the URL automatically.",
    inputSchema: zodToJsonSchema(ArticleNumberInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-import-article",
    description:
      "Pull/import an article from the shop into Xentral. POST /shopimport/articletoxentral/{articlenumber}. Article number is base64-encoded in the URL automatically.",
    inputSchema: zodToJsonSchema(ArticleNumberInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-push-article",
    description:
      "Push an article from Xentral to the shop. POST /shopimport/articletoshop/{articlenumber}. Article number is base64-encoded in the URL automatically.",
    inputSchema: zodToJsonSchema(ArticleNumberInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-import-order",
    description:
      "Import a single order from the shop into Xentral. POST /shopimport/ordertoxentral/{ordernumber}. Order number is base64-encoded in the URL automatically.",
    inputSchema: zodToJsonSchema(OrderNumberInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-statistics",
    description:
      "Get shop statistics: orders in shipment, open orders, packages today/yesterday, income, contribution margin. GET /shopimport/statistics.",
    inputSchema: zodToJsonSchema(EmptyInput) as Record<string, unknown>,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-disconnect",
    description:
      "Disconnect the shop (sets shopexport.aktiv = 0). POST /shopimport/disconnect.",
    inputSchema: zodToJsonSchema(EmptyInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-reconnect",
    description:
      "Reconnect the shop (sets shopexport.aktiv = 1). POST /shopimport/reconnect.",
    inputSchema: zodToJsonSchema(EmptyInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "openxe-shop-refund",
    description:
      "Process a refund for a shop order. POST /shopimport/refund. Accepts JSON body with refund details.",
    inputSchema: zodToJsonSchema(RefundInput) as Record<string, unknown>,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
];

// --- Helper: base64-encode for URL path segments ---

function b64Encode(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

// --- Handler ---

export async function handleShopTool(
  toolName: string,
  args: Record<string, unknown>,
  client: OpenXEClient
): Promise<ToolResult> {
  switch (toolName) {
    case "openxe-shop-status": {
      const result = await client.get("/shopimport/status");
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-auth": {
      const result = await client.post("/shopimport/auth", {});
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-sync-stock": {
      const { articlenumber } = ArticleNumberInput.parse(args);
      const encoded = b64Encode(articlenumber);
      const result = await client.post(
        `/shopimport/syncstorage/${encoded}`,
        {}
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-import-article": {
      const { articlenumber } = ArticleNumberInput.parse(args);
      const encoded = b64Encode(articlenumber);
      const result = await client.post(
        `/shopimport/articletoxentral/${encoded}`,
        {}
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-push-article": {
      const { articlenumber } = ArticleNumberInput.parse(args);
      const encoded = b64Encode(articlenumber);
      const result = await client.post(
        `/shopimport/articletoshop/${encoded}`,
        {}
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-import-order": {
      const { ordernumber } = OrderNumberInput.parse(args);
      const encoded = b64Encode(ordernumber);
      const result = await client.post(
        `/shopimport/ordertoxentral/${encoded}`,
        {}
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-statistics": {
      const result = await client.get("/shopimport/statistics");
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-disconnect": {
      const result = await client.post("/shopimport/disconnect", {});
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-reconnect": {
      const result = await client.post("/shopimport/reconnect", {});
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    case "openxe-shop-refund": {
      const input = RefundInput.parse(args);
      const result = await client.post("/shopimport/refund", input);
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}
