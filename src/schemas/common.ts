import { z } from "zod";

/** Pagination query parameters accepted by all list endpoints. */
export const PaginationParams = z.object({
  page: z.number().int().positive().optional().describe("Page number (1-based)"),
  items_per_page: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Items per page (max 1000)"),
});

/** Sort direction. */
export const SortDirection = z.enum(["ASC", "DESC"]).optional();

/** OpenXE API error response shape. */
export const ApiError = z.object({
  error: z.object({
    code: z.number(),
    http_code: z.number(),
    message: z.string(),
    href: z.string().optional(),
    details: z.array(z.string()).optional(),
  }),
});

/** Legacy API response envelope. */
export const LegacyResponse = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

/** Date string in YYYY-MM-DD format. */
export const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

/** Binary flag (0 or 1). */
export const BinaryFlag = z.union([z.literal(0), z.literal(1)]);
