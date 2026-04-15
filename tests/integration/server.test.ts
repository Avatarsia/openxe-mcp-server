import { describe, it, expect } from "vitest";

/**
 * Aggregates every tool definition registered by the full-mode server.
 * Mirrors the FULL_TOOLS + ROUTER_TOOLS lists in src/index.ts. When a new
 * tool group is added there, it must be added here too — the test then
 * enforces global invariants (no duplicate names, openxe-* prefix,
 * description/schema present) across the complete surface.
 */
async function getAllToolDefinitions() {
  const [
    address,
    doc,
    docRead,
    subscription,
    time,
    read,
    dashboard,
    procurement,
    report,
    businessQuery,
    batchPdf,
    router,
  ] = await Promise.all([
    import("../../src/tools/address-tools.js"),
    import("../../src/tools/document-tools.js"),
    import("../../src/tools/document-read-tools.js"),
    import("../../src/tools/subscription-tools.js"),
    import("../../src/tools/time-tools.js"),
    import("../../src/tools/read-tools.js"),
    import("../../src/tools/dashboard-tools.js"),
    import("../../src/tools/procurement-tools.js"),
    import("../../src/tools/report-tools.js"),
    import("../../src/tools/business-query-tools.js"),
    import("../../src/tools/batch-pdf-tools.js"),
    import("../../src/tools/router.js"),
  ]);

  return [
    ...address.ADDRESS_TOOL_DEFINITIONS,
    ...doc.DOCUMENT_TOOL_DEFINITIONS,
    ...docRead.DOCUMENT_READ_TOOL_DEFINITIONS,
    ...subscription.SUBSCRIPTION_TOOL_DEFINITIONS,
    ...time.TIME_TOOL_DEFINITIONS,
    ...read.READ_TOOL_DEFINITIONS,
    ...dashboard.DASHBOARD_TOOL_DEFINITIONS,
    ...procurement.PROCUREMENT_TOOL_DEFINITIONS,
    ...report.REPORT_TOOL_DEFINITIONS,
    businessQuery.BUSINESS_QUERY_TOOL_DEFINITION,
    batchPdf.BATCH_PDF_TOOL_DEFINITION,
    router.DISCOVER_TOOL_DEFINITION,
    router.ROUTER_TOOL_DEFINITION,
  ];
}

/**
 * Aggregates every resource definition registered by src/index.ts, including
 * the core resources that are inlined there.
 */
async function getAllResourceDefinitions() {
  const [documents, masterData, inventory] = await Promise.all([
    import("../../src/resources/documents.js"),
    import("../../src/resources/master-data.js"),
    import("../../src/resources/inventory.js"),
  ]);

  return [
    // Core resources inlined in src/index.ts (addresses + articles)
    { uri: "openxe://adressen", name: "Addresses" },
    { uri: "openxe://lieferadressen", name: "Delivery Addresses" },
    { uri: "openxe://artikel", name: "Articles" },
    { uri: "openxe://artikelkategorien", name: "Categories" },
    ...documents.getDocumentResourceDefinitions(),
    ...masterData.getMasterDataResourceDefinitions(),
    ...inventory.getInventoryResourceDefinitions(),
  ];
}

describe("OpenXE MCP Server Integration", () => {
  it("registers the full tool surface (all groups + router meta-tools)", async () => {
    const allTools = await getAllToolDefinitions();

    // Lower bound tracks the current surface; any new group added in
    // src/index.ts must also land in getAllToolDefinitions() above, which
    // will push this number up.
    expect(allTools.length).toBeGreaterThanOrEqual(60);

    const names = allTools.map((t) => t.name);

    // Spot-check one tool from every registered group so a silent drop of
    // an entire group (e.g. "forgot to re-export REPORT_TOOL_DEFINITIONS")
    // is caught here.
    expect(names).toContain("openxe-create-address");         // address-tools
    expect(names).toContain("openxe-create-order");           // document-tools
    expect(names).toContain("openxe-list-invoices");          // document-read-tools
    expect(names).toContain("openxe-list-subscriptions");     // subscription-tools
    expect(names).toContain("openxe-clock-status");           // time-tools
    expect(names).toContain("openxe-list-addresses");         // read-tools
    expect(names).toContain("openxe-dashboard");              // dashboard-tools
    expect(names).toContain("openxe-list-purchase-orders");   // procurement-tools
    expect(names).toContain("openxe-report-revenue");         // report-tools
    expect(names).toContain("openxe-business-query");         // business-query
    expect(names).toContain("openxe-batch-pdf");              // batch-pdf
    expect(names).toContain("openxe-discover");               // router meta
    expect(names).toContain("openxe");                        // router meta
  });

  it("every tool has a non-empty description and inputSchema", async () => {
    const allTools = await getAllToolDefinitions();
    for (const tool of allTools) {
      expect(tool.description, `${tool.name} is missing a description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} is missing an inputSchema`).toBeTruthy();
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("every tool name follows the openxe / openxe-* naming convention", async () => {
    const allTools = await getAllToolDefinitions();
    // The router meta-tool is exactly "openxe"; every other tool is
    // "openxe-<lower-case-dash-segments>".
    for (const tool of allTools) {
      const ok = tool.name === "openxe" || /^openxe(-[a-z0-9]+)+$/.test(tool.name);
      expect(ok, `Tool name "${tool.name}" violates the openxe / openxe-* convention`).toBe(true);
    }
  });

  it("has no duplicate tool names across the full surface", async () => {
    const allTools = await getAllToolDefinitions();
    const names = allTools.map((t) => t.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate tool names: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("registers the full resource surface", async () => {
    const allResources = await getAllResourceDefinitions();

    expect(allResources.length).toBeGreaterThanOrEqual(9);

    const uris = allResources.map((r) => r.uri);
    // Core resources
    expect(uris).toContain("openxe://adressen");
    expect(uris).toContain("openxe://lieferadressen");
    expect(uris).toContain("openxe://artikel");
    expect(uris).toContain("openxe://artikelkategorien");
    // Document resources
    expect(uris).toContain("openxe://belege/angebote");
    expect(uris).toContain("openxe://belege/auftraege");
    expect(uris).toContain("openxe://belege/rechnungen");
    expect(uris).toContain("openxe://belege/lieferscheine");
    expect(uris).toContain("openxe://belege/gutschriften");
  });

  it("has no duplicate resource URIs", async () => {
    const allResources = await getAllResourceDefinitions();
    const uris = allResources.map((r) => r.uri);
    const duplicates = uris.filter((u, i) => uris.indexOf(u) !== i);
    expect(duplicates, `Duplicate resource URIs: ${duplicates.join(", ")}`).toEqual([]);
  });
});
