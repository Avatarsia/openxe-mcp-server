import { z } from "zod";
import { PaginationParams, SortDirection, BinaryFlag } from "./common.js";

export const ArticleListParams = PaginationParams.extend({
  typ: z.string().optional().describe("Article type (LIKE)"),
  name_de: z.string().optional().describe("German name (%LIKE%)"),
  nummer: z.string().optional().describe("Article number (%LIKE%)"),
  nummer_equals: z.string().optional().describe("Exact article number"),
  projekt: z.number().int().optional().describe("Project ID"),
  ausverkauft: BinaryFlag.optional().describe("Sold out flag"),
  topseller: BinaryFlag.optional().describe("Topseller flag"),
  include: z
    .string()
    .optional()
    .describe(
      "Comma-separated includes: verkaufspreise,lagerbestand,dateien,projekt"
    ),
  sort: z.enum(["name_de", "name_en", "nummer", "typ"]).optional(),
  direction: SortDirection,
});

export const ArticleGetParams = z.object({
  id: z.number().int().positive().describe("Article ID"),
  include: z
    .string()
    .optional()
    .describe(
      "Comma-separated includes: verkaufspreise,lagerbestand,dateien,projekt"
    ),
});

export const ArticleCreateInput = z.object({
  name_de: z.string().describe("Article name (German)"),
  nummer: z.string().optional().describe("Article number (auto-generated if omitted)"),
  typ: z.string().optional().describe("Article type"),
  einheit: z.string().optional().describe("Unit of measure"),
}).catchall(z.unknown());

export const ArticleEditInput = z.object({
  id: z.number().int().positive().describe("Article ID to edit"),
}).catchall(z.unknown());

export const PriceEditInput = z.object({
  artikel: z.number().int().positive().describe("Article ID"),
}).catchall(z.unknown());
