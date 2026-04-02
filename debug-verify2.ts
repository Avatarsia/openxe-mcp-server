import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { applySlimMode, SLIM_FIELDS } from "./src/utils/field-filter.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());

async function main() {
  const result = await client.get("/v1/belege/auftraege", {});
  const rawData = result.data;
  
  let rows: any[];
  if (Array.isArray(rawData)) {
    rows = rawData;
    console.log("Branch: Array.isArray");
  } else if (rawData?.data && Array.isArray((rawData as any).data)) {
    rows = (rawData as any).data;
    console.log("Branch: rawData.data is array");
  } else if (rawData && typeof rawData === 'object') {
    rows = [rawData];
    console.log("Branch: single object");
  } else {
    rows = [];
    console.log("Branch: empty");
  }
  
  console.log("rows length:", rows.length);
  console.log("First row keys:", rows[0] ? Object.keys(rows[0]).slice(0, 10) : "none");
  console.log("SLIM_FIELDS.order:", SLIM_FIELDS.order);
  
  const slimmed = applySlimMode(rows, [...SLIM_FIELDS.order]);
  console.log("Slimmed first:", JSON.stringify((slimmed as any[])[0]));
}
main();
