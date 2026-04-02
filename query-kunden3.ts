import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const result = await client.get("/v1/adressen");
  const rawData = result.data;
  const list = Array.isArray(rawData) ? rawData : (rawData?.data && Array.isArray(rawData.data) ? rawData.data : [rawData]);

  console.log("Alle 20 Adressen:\n");
  list.forEach((a: any) => {
    console.log(`ID:${a.id} | KdNr:"${a.kundennummer}" | Name:"${a.name}" | Ort:${a.ort} | Land:${a.land} | DEL:${a.geloescht}`);
  });

  console.log("\n--- Filter: Kundennummer vorhanden, NICHT mit DEL- beginnend ---\n");
  const kunden = list.filter((a: any) => {
    const knr = String(a.kundennummer || "").trim();
    return knr !== "" && !knr.startsWith("DEL");
  });

  console.log(`${kunden.length} Kunden gefunden:\n`);
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
