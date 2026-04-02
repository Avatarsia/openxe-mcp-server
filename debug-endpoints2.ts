import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());

async function main() {
  // 1. Try to discover wiedervorlagen fields by POSTing with all plausible fields
  console.log("=== Wiedervorlagen field discovery ===");

  // Try a comprehensive set of all plausible field names
  const allFields = {
    bezeichnung: "test",
    beschreibung: "desc",
    betreff: "subject",
    adresse: 1,
    datum: "2026-04-03",
    datum_faellig: "2026-04-03",
    faellig_am: "2026-04-03",
    datum_erinnerung: "2026-04-03",
    zeit_erinnerung: "10:00:00",
    prio: "1",
    prioritaet: "hoch",
    bearbeiter: "admin",
    projekt: 1,
    modul: "adressen",
    parameter: 1,
    stages: 0,
    status: "offen"
  };

  try {
    const r = await client.post("/v1/wiedervorlagen", allFields);
    console.log("All fields:", JSON.stringify(r.data).substring(0,500));
  } catch(e: any) { console.log("All fields FAIL:", e.message?.substring(0,300)); }

  // Try to GET the OpenXE API docs/schema
  console.log("\n=== Try to discover available POST routes ===");

  // Try legacy NachrichtCreate for CRM
  console.log("\n=== Try Legacy CRM ===");
  try {
    const r = await client.legacyPost("NachrichtCreate", {
      nachricht: { typ: "notiz", betreff: "test", adresse: 1 }
    });
    console.log("NachrichtCreate:", JSON.stringify(r).substring(0,300));
  } catch(e: any) { console.log("NachrichtCreate:", e.message?.substring(0,200)); }

  try {
    const r = await client.legacyPost("EventNachrichtCreate", {
      nachricht: { typ: "notiz", betreff: "test", adresse: 1, inhalt: "test" }
    });
    console.log("EventNachrichtCreate:", JSON.stringify(r).substring(0,300));
  } catch(e: any) { console.log("EventNachrichtCreate:", e.message?.substring(0,200)); }

  // RechnungFreigabe confirmed working with flat payload, now verify handleDocumentTool sends it correctly
  console.log("\n=== RechnungFreigabe -- confirm flat works ===");
  // The legacyPost wraps its 2nd arg in {data: ...}
  // So legacyPost("RechnungFreigabe", {id: 2}) sends POST body: {"data": {"id": 2}}
  // But handleDocumentTool wraps in {rechnung: {id: 2}} which becomes {"data": {"rechnung": {"id": 2}}}
  // The API wants the id at the top level of data, not nested under "rechnung"
  try {
    const r = await client.legacyPost("RechnungFreigabe", { id: 3 });
    console.log("Flat id=3 OK:", JSON.stringify(r).substring(0,300));
  } catch(e: any) { console.log("Flat id=3:", e.message?.substring(0,200)); }
}
main().catch(e => console.error(e.message));
