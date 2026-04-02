import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { handleReadTool } from "./src/tools/read-tools.js";
import { handleDocumentReadTool } from "./src/tools/document-read-tools.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  console.log("=== OpenXE Aggregation Verification ===\n");

  try {
    // Count addresses
    console.log("1. Counting addresses...");
    let r = await handleReadTool("openxe-list-addresses", { aggregate: "count" }, client);
    console.log("Kunden count:", r.content[0].text);
    console.log();

    // Sum invoices
    console.log("2. Summing invoices (soll)...");
    r = await handleDocumentReadTool("openxe-list-invoices", { aggregate: { sum: "soll" } }, client);
    console.log("Rechnungen Summe:", r.content[0].text);
    console.log();

    // Group orders by status
    console.log("3. Grouping orders by status...");
    r = await handleDocumentReadTool("openxe-list-orders", { aggregate: { groupBy: "status", count: true } }, client);
    console.log("Auftraege nach Status:", r.content[0].text);
    console.log();

    // Group addresses by land
    console.log("4. Grouping addresses by country (land)...");
    r = await handleReadTool("openxe-list-addresses", { aggregate: { groupBy: "land", count: true } }, client);
    console.log("Kunden nach Land:", r.content[0].text);
    console.log();

    // Avg order value
    console.log("5. Computing average order value (gesamtsumme)...");
    r = await handleDocumentReadTool("openxe-list-orders", { aggregate: { avg: "gesamtsumme" } }, client);
    console.log("Durchschnittl. Auftragswert:", r.content[0].text);
    console.log();

    console.log("=== All aggregation queries completed successfully ===");
  } catch (e) {
    console.error("ERROR:", e.message);
    if (e.stack) {
      console.error("Stack:", e.stack);
    }
  }
}

main();
