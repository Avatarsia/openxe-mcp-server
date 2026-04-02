import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const c = new OpenXEClient(loadConfig());

async function main() {
  const tests: [string, string, any?][] = [
    ["15 Adressen (Liste)", "/v1/adressen"],
    ["1 Adresse (Detail)", "/v1/adressen/1"],
    ["15 Artikel (Liste)", "/v1/artikel"],
    ["1 Artikel+Preise+Lager", "/v1/artikel/1", {include:"verkaufspreise,lagerbestand"}],
    ["5 Auftraege", "/v1/belege/auftraege"],
    ["1 Auftrag+Positionen", "/v1/belege/auftraege/1", {include:"positionen"}],
    ["5 Rechnungen", "/v1/belege/rechnungen"],
    ["6 Kategorien", "/v1/artikelkategorien"],
  ];
  for (const [label, path, params] of tests) {
    try {
      const r = await c.get(path, params || {});
      const json = JSON.stringify(r.data);
      console.log(label.padEnd(30), json.length.toString().padStart(7), "chars ~" + Math.round(json.length/4).toString().padStart(5), "tokens");
    } catch(e: any) { console.log(label.padEnd(30), "error:", e.message?.substring(0,50)); }
  }
}
main();
