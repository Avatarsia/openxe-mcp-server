import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { applySlimMode, SLIM_FIELDS } from "./src/utils/field-filter.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const raw = await client.get("/v1/belege/auftraege");
  
  console.log("=== RAW STRUCTURE ===");
  console.log("raw.data type:", typeof raw.data);
  console.log("raw.data.data?:", typeof raw.data?.data);
  console.log("Array.isArray(raw.data):", Array.isArray(raw.data));
  console.log("Array.isArray(raw.data?.data):", Array.isArray(raw.data?.data));
  
  // The actual data array
  const actualData = raw.data?.data || raw.data;
  const list = Array.isArray(actualData) ? actualData : [actualData];
  
  console.log("\n=== ACTUAL DATA ===");
  console.log("Count:", list.length);
  console.log("First item keys:", Object.keys(list[0] || {}).slice(0, 10));
  
  console.log("\n=== SLIM APPLIED TO raw.data (WRONG?) ===");
  const slimWrong = applySlimMode(raw.data, [...SLIM_FIELDS.order]);
  console.log("Result:", JSON.stringify(slimWrong).substring(0, 200));
  
  console.log("\n=== SLIM APPLIED TO actual list (CORRECT) ===");
  const slimCorrect = applySlimMode(list, [...SLIM_FIELDS.order]);
  console.log("Result:", JSON.stringify(slimCorrect).substring(0, 300));
}
main().catch(e => console.error("ERROR:", e.message));
