import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  // Import the router tool
  const { handleRouterTool } = await import("./src/tools/router.js");

  // Call discover for "alle"
  const r = await handleRouterTool("openxe-discover", { category: "alle" }, client);
  const text = r.content[0].text;

  // Check for new features
  const checks = [
    "Smart Filter",
    "where",
    "sort_field",
    "limit",
    "format",
    "zeitraum",
    "status_preset",
    "aggregate",
    "batch-pdf",
    "dashboard",
    "business-query",
    "nicht-versendet",
    "offene-rechnungen"
  ];

  console.log("=== DISCOVER OUTPUT (first 1500 chars) ===");
  console.log(text.substring(0, 1500));
  console.log("\n=== FEATURE CHECKS ===");
  for (const check of checks) {
    const found = text.includes(check);
    console.log(found ? "✓" : "✗", check);
  }

  console.log("\n=== TOTAL OUTPUT LENGTH ===");
  console.log(`${text.length} characters`);
}

main().catch(e => console.error("ERROR:", e.message));
