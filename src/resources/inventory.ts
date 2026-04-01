import { OpenXEClient, EndpointNotAvailableError } from "../client/openxe-client.js";

const INVENTORY_RESOURCES = [
  {
    key: "lagercharge",
    path: "/v1/lagercharge",
    name: "Storage Batches",
    description:
      "Storage batch/charge tracking. Filters: artikel, lager_platz, charge, menge_gt",
  },
  {
    key: "lagermhd",
    path: "/v1/lagermhd",
    name: "Best-Before Dates",
    description:
      "Best-before date tracking. Filters: artikel, lager_platz, mhd_von, mhd_bis, abgelaufen",
  },
  {
    key: "trackingnummern",
    path: "/v1/trackingnummern",
    name: "Tracking Numbers",
    description:
      "Shipping tracking numbers. Filters: lieferschein, auftrag, tracking, versandart, datum_von, datum_bis, abgeschlossen",
  },
  {
    key: "dateien",
    path: "/v1/dateien",
    name: "Files",
    description: "File attachments. Filters: objekt, parameter, stichwort",
  },
  {
    key: "crm_dokumente",
    path: "/v1/crm_dokumente",
    name: "CRM Documents",
    description:
      "CRM notes, emails, call logs. Filters: adresse, typ (notiz|email|telefonat), datum_von, datum_bis, projekt",
  },
  {
    key: "wiedervorlagen",
    path: "/v1/wiedervorlagen",
    name: "Tasks/Resubmissions",
    description:
      "Tasks and reminders. Filters: bearbeiter, faellig_von, faellig_bis, erledigt, prioritaet, modul",
  },
  {
    key: "aboartikel",
    path: "/v1/aboartikel",
    name: "Subscriptions",
    description:
      "Subscription items. Filters: adresse, artikel, projekt, status, abogruppe",
  },
  {
    key: "abogruppen",
    path: "/v1/abogruppen",
    name: "Subscription Groups",
    description: "Subscription groups",
  },
  {
    key: "docscan",
    path: "/v1/docscan",
    name: "Scanned Documents",
    description:
      "Scanned documents. Filters: status (neu/zugeordnet/verarbeitet), datum_von, datum_bis, typ, lieferant",
  },
  {
    key: "reports",
    path: "/v1/reports",
    name: "Reports",
    description: "Reports. Filters: modul, kategorie",
  },
] as const;

export function getInventoryResourceDefinitions() {
  return INVENTORY_RESOURCES.map((r) => ({
    uri: `openxe://${r.key}`,
    name: `OpenXE ${r.name}`,
    description: r.description,
    mimeType: "application/json",
  }));
}

export async function handleInventoryResource(
  uri: string,
  client: OpenXEClient
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} | null> {
  const parsed = new URL(uri);
  const fullPath = parsed.hostname + parsed.pathname;
  const params = Object.fromEntries(parsed.searchParams);

  for (const resource of INVENTORY_RESOURCES) {
    if (fullPath.startsWith(resource.key)) {
      const segments = fullPath.split("/").filter(Boolean);
      const apiPath =
        segments.length > 1
          ? `${resource.path}/${segments[1]}`
          : resource.path;

      try {
        const result = await client.get(apiPath, params);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                segments.length > 1
                  ? result.data
                  : { data: result.data, pagination: result.pagination },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof EndpointNotAvailableError) {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(
                  { error: err.message, available: false },
                  null,
                  2
                ),
              },
            ],
          };
        }
        throw err;
      }
    }
  }

  return null;
}
