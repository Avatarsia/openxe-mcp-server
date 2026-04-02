import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import * as fs from "fs";
import * as path from "path";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());

async function main() {
  const result = await client.getRaw("/BelegPDF", { beleg: "angebot", id: "1" });
  const desktop = path.join(process.env.USERPROFILE || "", "Desktop", "angebot-100000.pdf");
  fs.writeFileSync(desktop, result.data);
  console.log("PDF gespeichert:", desktop, "(" + result.data.length + " Bytes)");
}
main();
