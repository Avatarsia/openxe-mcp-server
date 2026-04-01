import { OpenXEClient } from "../client/openxe-client.js";

// ── Mobile API Dashboard ──────────────────────────────────────────────

interface DashboardParams {
  date?: string; // YYYY-MM-DD
  interval?: number;
  mode?: "day" | "week" | "month" | "year";
}

// ── OpenTRANS Resources ───────────────────────────────────────────────

const OPENTRANS_RESOURCES = [
  {
    key: "orders",
    pathPrefix: "/opentrans/order",
    name: "OpenTRANS Orders",
    description:
      "OpenTRANS order exchange (XML). Lookup by ID, ordernumber, or extorder. Supports GET (read), POST (create), DELETE.",
  },
  {
    key: "invoices",
    pathPrefix: "/opentrans/invoice",
    name: "OpenTRANS Invoices",
    description:
      "OpenTRANS invoice exchange (XML). Lookup by ID, orderid, ordernumber, or extorder. Read-only via GET.",
  },
  {
    key: "dispatchnotifications",
    pathPrefix: "/opentrans/dispatchnotification",
    name: "OpenTRANS Dispatch Notifications",
    description:
      "OpenTRANS dispatch notification exchange (XML). Lookup by ID, orderid, ordernumber, or extorder. Supports GET (read) and PUT (update).",
  },
] as const;

/**
 * Resource definitions for the Mobile API dashboard and OpenTRANS endpoints.
 */
export function getSpecialApiResourceDefinitions() {
  return [
    // Mobile Dashboard
    {
      uri: "openxe://mobileapi/dashboard",
      name: "OpenXE Mobile Dashboard",
      description:
        "Mobile app dashboard with 17 widgets (orders, turnover, packages, customers, tickets, financial data). Params: date (YYYY-MM-DD), interval (int), mode (day|week|month|year). Permission: mobile_app_communication.",
      mimeType: "application/json",
    },
    // OpenTRANS
    ...OPENTRANS_RESOURCES.map((r) => ({
      uri: `openxe://opentrans/${r.key}`,
      name: `OpenXE ${r.name}`,
      description: `${r.description} Permission: handle_opentrans. Content-Type: application/xml.`,
      mimeType: "application/xml",
    })),
  ];
}

/**
 * Handle reads for Mobile API dashboard and OpenTRANS resources.
 */
export async function handleSpecialApiResource(
  uri: string,
  client: OpenXEClient
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} | null> {
  const parsed = new URL(uri);
  const fullPath = parsed.hostname + parsed.pathname;

  // ── Mobile Dashboard ──────────────────────────────────────────────
  if (fullPath === "mobileapi/dashboard" || fullPath === "mobileapi/dashboard/") {
    const params: Record<string, string | number | undefined> = {};
    const date = parsed.searchParams.get("date");
    const interval = parsed.searchParams.get("interval");
    const mode = parsed.searchParams.get("mode");

    if (date) params.date = date;
    if (interval) params.interval = parseInt(interval, 10);
    if (mode) params.mode = mode;

    const result = await client.get("/v1/mobileapi/dashboard", params);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  // ── OpenTRANS ─────────────────────────────────────────────────────
  if (fullPath.startsWith("opentrans/")) {
    const afterPrefix = fullPath.slice("opentrans/".length);
    const segments = afterPrefix.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const resourceKey = segments[0];
    const resource = OPENTRANS_RESOURCES.find((r) => r.key === resourceKey);
    if (!resource) return null;

    // Build the API path. Supports:
    //   openxe://opentrans/orders/42            -> /opentrans/order/42
    //   openxe://opentrans/orders/ordernumber/B-12345
    //   openxe://opentrans/invoices/extorder/EXT001
    const apiPath =
      segments.length > 1
        ? `${resource.pathPrefix}/${segments.slice(1).join("/")}`
        : resource.pathPrefix;

    const result = await client.get(apiPath);
    return {
      contents: [
        {
          uri,
          mimeType: "application/xml",
          text:
            typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  return null;
}
