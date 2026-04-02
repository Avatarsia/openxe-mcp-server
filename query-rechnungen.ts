import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

async function main() {
  const result = await client.get("/v1/belege/rechnungen");
  const raw = result.data;
  const list = Array.isArray(raw) ? raw : (raw?.data ? (Array.isArray(raw.data) ? raw.data : [raw.data]) : [raw]);

  console.log(`=== ${list.length} Rechnungen gefunden ===\n`);

  const adressen = new Map();

  for (const r of list) {
    const key = `${r.name}|${r.strasse}|${r.plz}|${r.ort}`;
    if (!adressen.has(key)) {
      adressen.set(key, {
        name: r.name,
        ansprechpartner: r.ansprechpartner || "-",
        strasse: r.strasse,
        plz: r.plz,
        ort: r.ort,
        land: r.land,
        rechnungen: []
      });
    }
    adressen.get(key).rechnungen.push({
      belegnr: r.belegnr || "(Entwurf)",
      soll: r.soll,
      status: r.zahlungsstatus || r.status
    });
  }

  console.log(`=== ${adressen.size} eindeutige Rechnungsadressen ===\n`);

  for (const [, addr] of adressen) {
    console.log(`${addr.name}`);
    console.log(`  ${addr.strasse}, ${addr.plz} ${addr.ort}, ${addr.land}`);
    console.log(`  Ansprechpartner: ${addr.ansprechpartner}`);
    console.log(`  Rechnungen:`);
    for (const re of addr.rechnungen) {
      console.log(`    - ${re.belegnr} | ${re.soll} EUR | ${re.status}`);
    }
    console.log();
  }
}

main().catch(e => console.error("Fehler:", e.message));
