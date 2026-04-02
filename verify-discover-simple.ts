import { handleDiscover } from "./src/tools/router.js";

async function main() {
  // Call discover for "alle"
  const r = handleDiscover({ category: "alle" });
  const text = r.content[0].text;

  // Check for new features
  const checks = [
    "Smart Filter",
    "where",
    "sort_field",
    "limit",
    "format",
    "zeitraum",
    "status_preset",
    "aggregate",
    "batch-pdf",
    "dashboard",
    "business-query",
    "nicht-versendet",
    "offene-rechnungen"
  ];

  console.log("=== DISCOVER OUTPUT (first 2000 chars) ===");
  console.log(text.substring(0, 2000));
  console.log("\n=== FEATURE CHECKS ===");
  const results: string[] = [];
  for (const check of checks) {
    const found = text.includes(check);
    const status = found ? "✓" : "✗";
    results.push(`${status} ${check}`);
    console.log(`${status} ${check}`);
  }

  console.log("\n=== TOTAL OUTPUT LENGTH ===");
  console.log(`${text.length} characters`);

  console.log("\n=== FULL OUTPUT ===");
  console.log(text);
}

main().catch(e => console.error("ERROR:", e.message));
