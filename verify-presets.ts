import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { handleBusinessQueryTool } from "./src/tools/business-query-tools.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const presets = ["nicht-versendet", "ohne-tracking", "offene-rechnungen", "ueberfaellige-rechnungen", "entwuerfe"];
  for (const p of presets) {
    try {
      const r = await handleBusinessQueryTool({ preset: p }, client);
      const parsed = JSON.parse(r.content[0].text);
      console.log("✓", p, "→", Array.isArray(parsed.data) ? parsed.data.length + " Ergebnisse" : JSON.stringify(parsed).substring(0,100));
    } catch(e) {
      console.log("✗", p, "→", (e as Error).message?.substring(0,100));
    }
  }
}

main();
