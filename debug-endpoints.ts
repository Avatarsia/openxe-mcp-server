import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());

async function main() {
  console.log("=== Check CRM endpoints ===");
  try {
    const r = await client.get("/v1/crm_dokumente");
    console.log("GET crm_dokumente:", JSON.stringify(r.data).substring(0,300));
  } catch(e: any) { console.log("GET crm_dokumente FAIL:", e.message, "HTTP:", e.httpCode); }

  try {
    const r = await client.get("/v1/event_nachricht");
    console.log("GET event_nachricht:", JSON.stringify(r.data).substring(0,300));
  } catch(e: any) { console.log("GET event_nachricht FAIL:", e.message, "HTTP:", e.httpCode); }

  console.log("\n=== Check wiedervorlagen ===");
  try {
    const r = await client.get("/v1/wiedervorlagen");
    console.log("GET wiedervorlagen:", JSON.stringify(r.data).substring(0,500));
  } catch(e: any) { console.log("GET wiedervorlagen FAIL:", e.message, "HTTP:", e.httpCode); }

  // Try different field combinations for wiedervorlagen POST
  const combos = [
    { bezeichnung: "test", datum_faellig: "2026-04-03" },
    { bezeichnung: "test", adresse: 1, datum_erinnerung: "2026-04-03" },
    { beschreibung: "test", adresse: 1, datum: "2026-04-03" },
  ];
  for (const combo of combos) {
    try {
      const r = await client.post("/v1/wiedervorlagen", combo);
      console.log("POST wiedervorlagen OK:", JSON.stringify(combo), "=>", JSON.stringify(r.data).substring(0,300));
    } catch(e: any) { console.log("POST wiedervorlagen", JSON.stringify(combo), "=>", e.message?.substring(0,150)); }
  }

  console.log("\n=== Debug RechnungFreigabe ===");
  // Try different key combos
  const freigabeCombos: [string, any][] = [
    ["flat id=2", { id: 2 }],
    ["{rechnung:{sid:2}}", { rechnung: { sid: 2 } }],
    ["{rechnung:{id:'2'}}", { rechnung: { id: "2" } }],
    ["just empty + id in rechnung", { rechnung: { id: 2 } }],
  ];
  for (const [label, payload] of freigabeCombos) {
    try {
      const r = await client.legacyPost("RechnungFreigabe", payload);
      console.log(label, "=>", JSON.stringify(r).substring(0,300));
    } catch(e: any) { console.log(label, "=> FAIL:", e.message?.substring(0,200)); }
  }
}
main().catch(e => console.error(e.message));
