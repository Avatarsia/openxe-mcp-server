import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  // 1. Direkt via client
  console.log("=== DIREKT VIA CLIENT ===");
  const raw = await client.get("/v1/belege/auftraege");
  console.log("Type:", typeof raw.data, Array.isArray(raw.data));
  console.log("Raw data structure:", JSON.stringify(raw.data).substring(0, 300));
  
  // 2. Via read tool handler
  console.log("\n=== VIA DOCUMENT READ TOOL ===");
  const { handleDocumentReadTool } = await import("./src/tools/document-read-tools.js");
  const result = await handleDocumentReadTool("openxe-list-orders", {}, client);
  console.log("Tool result:", JSON.stringify(result).substring(0, 500));
  
  // 3. Via router
  console.log("\n=== VIA ROUTER ===");
  const { handleRouterTool } = await import("./src/tools/router.js");
  const routerResult = await handleRouterTool("openxe", { action: "list-orders" }, client);
  console.log("Router result:", JSON.stringify(routerResult).substring(0, 500));
}
main().catch(e => console.error("ERROR:", e.message));
