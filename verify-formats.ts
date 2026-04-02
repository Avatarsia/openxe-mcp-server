import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { handleReadTool } from "./src/tools/read-tools.js";
import { handleDocumentReadTool } from "./src/tools/document-read-tools.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  // Table format
  let r = await handleReadTool("openxe-list-addresses", { format: "table", limit: 5, fields: ["kundennummer", "name", "ort"] }, client);
  console.log("=== TABLE ===\n" + r.content[0].text.substring(0, 500));
  
  // CSV format
  r = await handleDocumentReadTool("openxe-list-orders", { format: "csv", limit: 5 }, client);
  console.log("\n=== CSV ===\n" + r.content[0].text.substring(0, 500));
  
  // IDs format
  r = await handleReadTool("openxe-list-addresses", { format: "ids" }, client);
  console.log("\n=== IDS ===\n" + r.content[0].text.substring(0, 200));
}

main().catch(e => console.error("ERROR:", e.message));
