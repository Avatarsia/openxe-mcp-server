import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  // Direkt die API aufrufen — client.get() gibt immer die vollen Daten
  const result = await client.get("/v1/adressen");
  const rawData = result.data;
  
  // Debug: Struktur anschauen
  const list = Array.isArray(rawData) ? rawData : (rawData?.data && Array.isArray(rawData.data) ? rawData.data : [rawData]);
  
  console.log("Gesamt Adressen:", list.length);
  console.log("Erstes Element Keys:", Object.keys(list[0] || {}).slice(0, 15));
  console.log("Erste Kundennummer:", list[0]?.kundennummer);
  console.log();

  // Alle mit Kundennummer
  const kunden = list.filter((a: any) => {
    const knr = a.kundennummer || "";
    const del = String(a.geloescht || "0");
    return knr.trim() !== "" && del !== "1";
  });

  console.log(`=== ${kunden.length} Kunden mit Kundennummer (nicht gelöscht) ===\n`);

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
