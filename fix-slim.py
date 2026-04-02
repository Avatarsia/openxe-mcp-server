import re
import sys

# --- Fix read-tools.ts ---
with open('src/tools/read-tools.ts', 'r') as f:
    content = f.read()

# 1. Remove 'full' lines from all input schemas
content = content.replace(
    '  full: z.boolean().optional().describe("Return all fields (default false = slim mode with key fields only)"),\n', '')

# 2. Update list descriptions
desc_replacements = [
    ('Liste aller Adressen/Kunden (List all addresses/customers). GET /v1/adressen. Optionale Filter: kundennummer, name, email, land. HINWEIS: Nur kundennummer wird serverseitig gefiltert; name/email/land werden clientseitig gefiltert. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.',
     'Liste aller Adressen/Kunden (GET /v1/adressen). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Fuer alle Details eines Eintrags nutze openxe-get-address. Optionale Filter: kundennummer, name, email, land. HINWEIS: Nur kundennummer wird serverseitig gefiltert; name/email/land werden clientseitig gefiltert.'),

    ('Einzelne Adresse abrufen (Get a single address by ID). GET /v1/adressen/{id}.',
     'Einzelne Adresse abrufen (GET /v1/adressen/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck.'),

    ('Liste aller Artikel (List all articles). GET /v1/artikel. Optionale Filter: name_de, nummer, typ, projekt. Include: verkaufspreise, lagerbestand, dateien, projekt. HINWEIS: Preise nur mit include=verkaufspreise sichtbar. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.',
     'Liste aller Artikel (GET /v1/artikel). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Fuer alle Details eines Artikels nutze openxe-get-article. Optionale Filter: name_de, nummer, typ, projekt. Include: verkaufspreise, lagerbestand, dateien, projekt. HINWEIS: Preise nur mit include=verkaufspreise sichtbar.'),

    ('Einzelnen Artikel abrufen (Get a single article by ID). GET /v1/artikel/{id}. Include: verkaufspreise, lagerbestand, dateien, projekt.',
     'Einzelnen Artikel abrufen (GET /v1/artikel/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Include: verkaufspreise, lagerbestand, dateien, projekt.'),

    ('Liste aller Artikelkategorien (List all article categories). GET /v1/artikelkategorien. Optionale Filter: bezeichnung, parent, projekt. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.',
     'Liste aller Artikelkategorien (GET /v1/artikelkategorien). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Optionale Filter: bezeichnung, parent, projekt.'),

    ('Liste aller Versandarten (List all shipping methods). GET /v1/versandarten. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.',
     'Liste aller Versandarten (GET /v1/versandarten). Gibt eine kompakte Liste zurueck (nur Schluesselfelder).'),

    ('Liste aller Dateien/Anhaenge (List all file attachments). GET /v1/dateien. Optionale Filter: objekt, parameter, stichwort. Gibt standardmaessig nur Schluesselfelder zurueck. Mit full=true werden alle Felder geladen.',
     'Liste aller Dateien/Anhaenge (GET /v1/dateien). Gibt eine kompakte Liste zurueck (nur Schluesselfelder). Optionale Filter: objekt, parameter, stichwort.'),
]

for old, new in desc_replacements:
    assert old in content, f"Description not found: {old[:60]}..."
    content = content.replace(old, new)

# 3. Fix address handler: remove full from destructuring
content = content.replace(
    'const { name: nameFilter, email, land, full, ...serverParams } = args;',
    'const { name: nameFilter, email, land, ...serverParams } = args;')

# 4. Remove all "const { full, ...filterArgs } = args;"
content = content.replace(
    'const { full, ...filterArgs } = args;',
    'const filterArgs = args;')

# 5. Replace address if(!full) block
addr_old = """      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.address) as Record<string, unknown>[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\\n\\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };"""

addr_new = """      data = applySlimMode(data, SLIM_FIELDS.address) as Record<string, unknown>[];
      const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
      data = truncated;

      let text = JSON.stringify({ data }, null, 2);
      if (wasTruncated) {
        text = `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter um die Ergebnismenge einzuschraenken. Fuer alle Details eines Eintrags nutze openxe-get-address.\\n\\n` + text;
      }

      return { content: [{ type: "text", text }] };"""

assert addr_old in content, "Address block not found"
content = content.replace(addr_old, addr_new)

# 6. Replace other list handler blocks
for slim_key, hint in [
    ('article', ' Fuer alle Details eines Artikels nutze openxe-get-article.'),
    ('category', ''),
    ('shipping', ''),
    ('file', ''),
]:
    old_block = """      if (!full) {
        data = applySlimMode(data, SLIM_FIELDS.""" + slim_key + """) as any[];
        const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
        data = truncated;
        if (wasTruncated) {
          return { content: [{ type: "text", text: `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter oder full=true fuer alle.\\n\\n` + JSON.stringify(data, null, 2) }] };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              full ? { data, pagination: result.pagination } : { data },
              null,
              2
            ),
          },
        ],
      };"""

    new_block = """      data = applySlimMode(data, SLIM_FIELDS.""" + slim_key + """) as any[];
      const { data: truncated, truncated: wasTruncated, total } = truncateWithWarning(data, MAX_LIST_RESULTS);
      data = truncated;

      let text = JSON.stringify({ data }, null, 2);
      if (wasTruncated) {
        text = `Zeige ${truncated.length} von ${total} Ergebnissen. Nutze Filter um die Ergebnismenge einzuschraenken.""" + hint + """\\n\\n` + text;
      }

      return { content: [{ type: "text", text }] };"""

    assert old_block in content, f"Block for {slim_key} not found"
    content = content.replace(old_block, new_block, 1)

with open('src/tools/read-tools.ts', 'w') as f:
    f.write(content)

remaining = len(re.findall(r'\bfull\b', content))
print(f'read-tools.ts: remaining "full" occurrences: {remaining}')

# --- Fix document-read-tools.ts ---
with open('src/tools/document-read-tools.ts', 'r') as f:
    content2 = f.read()

# Remove full from ListFilters
full_schema = """  full: z
    .boolean()
    .optional()
    .default(false)
    .describe("Wenn true, alle Felder zurueckgeben; Standard: nur Schluesselfelder"),
"""
assert full_schema in content2, "ListFilters full schema not found"
content2 = content2.replace(full_schema, '')

# Update list description template
content2 = content2.replace(
    'Gibt standardmaessig nur Schluesselfelder zurueck (id, belegnr, status, name, datum, summe). Mit full=true alle Felder.',
    'Gibt eine kompakte Liste zurueck (nur Schluesselfelder: id, belegnr, status, name, datum, summe). Fuer alle Details eines Eintrags nutze ${dt.getName}.')

# Update get description
content2 = content2.replace(
    "Einzelnes Dokument aus ${dt.labelDe} abrufen (GET /v1/belege/${dt.path}/{id}). Optional: include (z.B. 'positionen,protokoll').",
    "Einzelnes Dokument aus ${dt.labelDe} abrufen (GET /v1/belege/${dt.path}/{id}). Gibt ALLE Felder eines einzelnen Datensatzes zurueck. Optional: include (z.B. 'positionen,protokoll').")

# Remove if (!filters.full) wrapper
old_slim = """    // Apply slim mode unless full=true
    if (!filters.full) {
      const slimFields = LIST_TOOL_SLIM[toolName];
      rows = applySlimMode(rows, [...slimFields]) as Record<string, unknown>[];
    }"""

new_slim = """    // Always apply slim mode on list tools
    const slimFields = LIST_TOOL_SLIM[toolName];
    rows = applySlimMode(rows, [...slimFields]) as Record<string, unknown>[];"""

assert old_slim in content2, "Document slim block not found"
content2 = content2.replace(old_slim, new_slim)

with open('src/tools/document-read-tools.ts', 'w') as f:
    f.write(content2)

remaining2 = len(re.findall(r'\bfull\b', content2))
print(f'document-read-tools.ts: remaining "full" occurrences: {remaining2}')

if remaining > 0 or remaining2 > 0:
    sys.exit(1)
print("All done!")
