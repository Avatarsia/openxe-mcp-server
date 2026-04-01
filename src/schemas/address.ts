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
