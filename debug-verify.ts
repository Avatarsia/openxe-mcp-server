import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());
async function main() {
  const { handleDocumentReadTool } = await import("./src/tools/document-read-tools.js");
  const r = await handleDocumentReadTool("openxe-list-orders", {}, client);
  console.log("Result:", JSON.stringify(r).substring(0, 500));
}
main();
