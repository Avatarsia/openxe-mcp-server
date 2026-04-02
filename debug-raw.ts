import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());
async function main() {
  const result = await client.get("/v1/belege/auftraege", {});
  console.log("typeof result.data:", typeof result.data);
  console.log("Array.isArray(result.data):", Array.isArray(result.data));
  const raw = JSON.stringify(result.data);
  console.log("result.data (first 800):", raw.substring(0, 800));
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    const keys = Object.keys(result.data);
    console.log("keys:", keys);
    if (result.data.data) {
      console.log("typeof result.data.data:", typeof result.data.data);
      console.log("Array.isArray(result.data.data):", Array.isArray(result.data.data));
      const inner = JSON.stringify(result.data.data);
      console.log("result.data.data (first 800):", inner.substring(0, 800));
    }
  }
}
main();
