import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const result = await client.get("/v1/adressen");
  const rawData = result.data;
  const list = Array.isArray(rawData) ? rawData : (rawData?.data && Array.isArray(rawData.data) ? rawData.data : []);

  // Filter: nur mit Kundennummer, ohne gelöschte
  const kunden = list.filter((a: any) => 
    a.kundennummer && 
    a.kundennummer !== "" && 
    a.geloescht !== "1" && 
    a.geloescht !== 1
  );

  console.log(`=== ${kunden.length} Kunden mit Kundennummer (nicht gelöscht) ===\n`);

  kunden.forEach((k: any) => {
    console.log(`Kundennr: ${k.kundennummer}`);
    console.log(`  Name: ${k.name} ${k.vorname || ""}`);
    console.log(`  Firma: ${k.typ === "firma" ? "Ja" : "Nein"}`);
    console.log(`  Ansprechpartner: ${k.ansprechpartner || "-"}`);
    console.log(`  Strasse: ${k.strasse || "-"}`);
    console.log(`  PLZ/Ort: ${k.plz || "-"} ${k.ort || "-"}`);
    console.log(`  Land: ${k.land || "-"}`);
    console.log(`  Email: ${k.email || "-"}`);
    console.log(`  Telefon: ${k.telefon || "-"}`);
    console.log(`  Mobil: ${k.mobil || "-"}`);
    console.log();
  });
}
main().catch(e => console.error("Fehler:", e.message));
