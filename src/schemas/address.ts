import { z } from "zod";
import { PaginationParams, SortDirection, BinaryFlag } from "./common.js";

export const AddressListParams = PaginationParams.extend({
  rolle: z.string().optional().describe("Role filter (%LIKE%)"),
  name: z.string().optional().describe("Name filter (%LIKE%)"),
  name_equals: z.string().optional().describe("Exact name match"),
  kundennummer: z.string().optional().describe("Customer number (%LIKE%)"),
  kundennummer_equals: z
    .string()
    .optional()
    .describe("Exact customer number"),
  lieferantennummer: z
    .string()
    .optional()
    .describe("Supplier number (%LIKE%)"),
  email: z.string().optional().describe("Email filter (%LIKE%)"),
  land: z.string().optional().describe("Country code (LIKE)"),
  typ: z.string().optional().describe("Address type"),
  projekt: z.number().int().optional().describe("Project ID (exact)"),
  freifeld1: z.string().optional(),
  freifeld2: z.string().optional(),
  freifeld3: z.string().optional(),
  freifeld4: z.string().optional(),
  freifeld5: z.string().optional(),
  freifeld6: z.string().optional(),
  freifeld7: z.string().optional(),
  freifeld8: z.string().optional(),
  freifeld9: z.string().optional(),
  freifeld10: z.string().optional(),
  sort: z
    .enum(["name", "kundennummer", "lieferantennummer", "mitarbeiternummer"])
    .optional(),
  direction: SortDirection,
});

export const AddressGetParams = z.object({
  id: z.number().int().positive().describe("Address ID"),
});

export const AddressCreateInput = z.object({
  typ: z.string().describe("Address type (e.g., 'firma', 'herr', 'frau')"),
  name: z.string().describe("Company name or last name"),
  vorname: z.string().optional().describe("First name"),
  firma: z.string().optional().describe("Company name"),
  strasse: z.string().optional().describe("Street address"),
  plz: z.string().optional().describe("Postal code"),
  ort: z.string().optional().describe("City"),
  land: z.string().optional().describe("Country code (2-char ISO)"),
  email: z.string().optional().describe("Email address"),
  telefon: z.string().optional().describe("Phone number"),
  kundennummer: z.string().default("NEU").describe("Customer number. Default 'NEU' = system auto-generates the next number."),
  projekt: z.number().int().optional().describe("Project ID"),
  lieferantennummer: z.string().optional().describe("Supplier number — omit or use 'NEU' to let the system auto-generate. Only set explicitly if a specific number is required."),
  ustid: z.string().optional().describe("VAT ID (Umsatzsteuer-ID)"),
  rolle: z.string().optional().describe("Role: Kunde, Lieferant, or both"),
  waehrung: z.string().optional().describe("Default currency"),
  sprache: z.string().optional().describe("Language (e.g. deutsch, englisch)"),

  // Contact
  telefax: z.string().optional().describe("Fax number"),
  mobil: z.string().optional().describe("Mobile phone"),
  internetseite: z.string().optional().describe("Website URL"),
  ansprechpartner: z.string().optional().describe("Contact person name"),
  abteilung: z.string().optional().describe("Department"),
  anrede: z.string().optional().describe("Salutation (Herr, Frau)"),
  titel: z.string().optional().describe("Title (Dr., Prof.)"),
  adresszusatz: z.string().optional().describe("Address supplement / c/o"),

  // Bank details
  iban: z.string().optional().describe("IBAN"),
  swift: z.string().optional().describe("BIC/SWIFT code"),
  inhaber: z.string().optional().describe("Bank account holder name"),
  bank: z.string().optional().describe("Bank name"),

  // Payment terms
  zahlungszieltage: z.string().optional().describe("Payment term in days (e.g. '30')"),
  zahlungszieltageskonto: z.string().optional().describe("Skonto days (e.g. '10')"),
  zahlungszielskonto: z.string().optional().describe("Skonto percentage (e.g. '2')"),
  versandart: z.string().optional().describe("Default shipping method"),
  steuernummer: z.string().optional().describe("Tax number (Steuernummer)"),
  sonstiges: z.string().optional().describe("Notes / additional info"),

  // Document delivery — per-document-type email overrides (replaces main email for that doc type)
  angebot_email: z.string().optional().describe("Override email for quotes (Angebote)"),
  auftrag_email: z.string().optional().describe("Override email for orders (Auftraege)"),
  rechnungs_email: z.string().optional().describe("Override email for invoices (Rechnungen)"),
  gutschrift_email: z.string().optional().describe("Override email for credit memos (Gutschriften)"),
  lieferschein_email: z.string().optional().describe("Override email for delivery notes (Lieferscheine)"),
  bestellung_email: z.string().optional().describe("Override email for purchase orders (Bestellungen)"),

  // Document delivery — CC emails (additional copy sent alongside main email)
  angebot_cc: z.string().optional().describe("CC email for quotes"),
  auftrag_cc: z.string().optional().describe("CC email for orders"),
  rechnung_cc: z.string().optional().describe("CC email for invoices"),
  gutschrift_cc: z.string().optional().describe("CC email for credit memos"),
  lieferschein_cc: z.string().optional().describe("CC email for delivery notes"),
  bestellung_cc: z.string().optional().describe("CC email for purchase orders"),

  // Invoice delivery mode
  rechnung_permail: z.number().optional().describe("Force invoices via email (1=yes)"),
  rechnung_papier: z.number().optional().describe("Also print paper copy of invoices (1=yes)"),
  rechnung_anzahlpapier: z.number().optional().describe("Number of paper copies for invoices"),

  // Alternative invoice address
  abweichende_rechnungsadresse: z.number().optional().describe("Use alternative invoice address (1=yes)"),
  rechnung_name: z.string().optional().describe("Alt. invoice address: company/name"),
  rechnung_strasse: z.string().optional().describe("Alt. invoice address: street"),
  rechnung_plz: z.string().optional().describe("Alt. invoice address: postal code"),
  rechnung_ort: z.string().optional().describe("Alt. invoice address: city"),
  rechnung_land: z.string().optional().describe("Alt. invoice address: country (2-char ISO)"),
  rechnung_ansprechpartner: z.string().optional().describe("Alt. invoice address: contact person"),
  rechnung_email: z.string().optional().describe("Alt. invoice address: email"),

  // Electronic dispatch
  gln: z.string().optional().describe("Global Location Number (GLN) for EDI"),
});

export const AddressEditInput = z.object({
  id: z.number().int().positive().describe("Address ID to edit"),
}).catchall(z.unknown());

export const DeliveryAddressCreateInput = z.object({
  name: z.string().describe("Delivery address name"),
  adresse: z.number().int().positive().describe("Parent address ID"),
  typ: z.string().optional().describe("Address type"),
  strasse: z.string().optional().describe("Street address"),
  plz: z.string().optional().describe("Postal code"),
  ort: z.string().optional().describe("City"),
  land: z
    .string()
    .length(2)
    .optional()
    .describe("Country code (2-char ISO)"),
  standardlieferadresse: BinaryFlag.optional().describe(
    "Set as default delivery address"
  ),
  ust_befreit: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
    .optional()
    .describe("VAT exemption status (0-3)"),
});

export const DeliveryAddressEditInput = DeliveryAddressCreateInput.partial()
  .omit({ adresse: true })
  .extend({
    id: z.number().int().positive().describe("Delivery address ID"),
  });

export const DeliveryAddressListParams = PaginationParams.extend({
  adresse: z.number().int().optional().describe("Parent address ID"),
  name: z.string().optional().describe("Name filter (%LIKE%)"),
  land: z.string().optional().describe("Country code"),
  standardlieferadresse: BinaryFlag.optional(),
  sort: z.enum(["name", "plz", "land"]).optional(),
  direction: SortDirection,
});
