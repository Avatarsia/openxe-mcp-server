import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { handleBusinessQueryTool } from "./src/tools/business-query-tools.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const presets = ["nicht-versendet", "ohne-tracking", "offene-rechnungen", "ueberfaellige-rechnungen", "entwuerfe"];

  console.log("=== Business Query Presets Verification ===\n");

  for (const preset of presets) {
    try {
      const result = await handleBusinessQueryTool({ preset }, client);
      const parsed = JSON.parse(result.content[0].text);

      console.log(`✓ ${preset.toUpperCase()}`);
      console.log(`  Description: ${parsed._description}`);
      console.log(`  Info: ${parsed._info}`);

      if (Array.isArray(parsed.data) && parsed.data.length > 0) {
        console.log(`  Sample record: ${JSON.stringify(parsed.data[0])}`);
      }
      console.log();
    } catch(e) {
      const error = e as Error;
      console.log(`✗ ${preset.toUpperCase()}`);
      console.log(`  Error: ${error.message}`);
      console.log();
    }
  }
}

main();
