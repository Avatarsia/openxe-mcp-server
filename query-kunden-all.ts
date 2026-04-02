import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  // Alle Seiten holen
  let all: any[] = [];
  let page = 1;
  while (true) {
    const result = await client.get("/v1/adressen", { page: String(page), items: "100" });
    const rawData = result.data;
    const list = Array.isArray(rawData) ? rawData : (rawData?.data && Array.isArray(rawData.data) ? rawData.data : []);
    if (list.length === 0) break;
    all = all.concat(list);
    if (list.length < 100) break;
    page++;
  }

  console.log(`Gesamt: ${all.length} Adressen über ${page} Seite(n)\n`);

  // Filtern: hat Kundennummer, NICHT DEL-, nicht gelöscht
  const kunden = all.filter((a: any) => {
    const knr = String(a.kundennummer || "").trim();
    const del = String(a.geloescht || "0");
    return knr !== "" && !knr.startsWith("DEL") && del !== "1";
  });

  console.log(`=== ${kunden.length} aktive Kunden (ohne DEL) ===\n`);

  kunden.forEach((k: any) => {
    console.log(`Kundennr: ${k.kundennummer}`);
    console.log(`  Name: ${k.name || "-"} ${k.vorname || ""}`);
    console.log(`  Ansprechpartner: ${k.ansprechpartner || "-"}`);
    console.log(`  Strasse: ${k.strasse || "-"}`);
    console.log(`  PLZ/Ort: ${k.plz || "-"} ${k.ort || "-"}`);
    console.log(`  Land: ${k.land || "-"}`);
    console.log(`  Email: ${k.email || "-"}`);
    console.log(`  Telefon: ${k.telefon || "-"}`);
    console.log();
  });
}
main().catch(e => console.error("Fehler:", e.message));
