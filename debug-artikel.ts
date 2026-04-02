import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";
import { filterDeleted } from "./src/utils/field-filter.js";
process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";
const client = new OpenXEClient(loadConfig());

async function main() {
  const r = await client.get("/v1/artikel", { page: "1", items: "5" });
  const list = r.data?.data || r.data;
  const arr = Array.isArray(list) ? list : [list];
  
  console.log("Rohdaten (erste 3):");
  arr.slice(0, 3).forEach((a: any) => {
    console.log(`  id:${a.id} name:${a.name} name_de:${a.name_de} kundennummer:${a.kundennummer} belegnr:${a.belegnr} geloescht:${a.geloescht}`);
  });
  
  console.log("\nNach filterDeleted:", filterDeleted(arr).length, "von", arr.length);
}
main();
