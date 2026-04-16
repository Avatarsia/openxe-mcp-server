import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleSubscriptionTool,
  SUBSCRIPTION_TOOL_DEFINITIONS,
} from "../../src/tools/subscription-tools.js";
import { localDateString } from "../../src/utils/local-date.js";

describe("Subscription Tools", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    legacyPost: ReturnType<typeof vi.fn>;
    postForm: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      put: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      delete: vi.fn().mockResolvedValue({}),
      legacyPost: vi.fn().mockResolvedValue({ data: {}, success: true }),
      postForm: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    };
  });

  // --- CRM Document: auto-set datum/uhrzeit/bearbeiter ---

  describe("openxe-create-crm-document", () => {
    it("auto-sets datum to today when not provided", async () => {
      const today = localDateString(new Date());

      await handleSubscriptionTool(
        "openxe-create-crm-document",
        {
          typ: "notiz",
          betreff: "Test",
          adresse_from: 1,
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.datum).toBe(today);
    });

    it("auto-sets uhrzeit when not provided", async () => {
      await handleSubscriptionTool(
        "openxe-create-crm-document",
        {
          typ: "notiz",
          betreff: "Test",
          adresse_from: 1,
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.uhrzeit).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("auto-sets bearbeiter to API when not provided", async () => {
      await handleSubscriptionTool(
        "openxe-create-crm-document",
        {
          typ: "notiz",
          betreff: "Test",
          adresse_from: 1,
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.bearbeiter).toBe("API");
    });

    it("preserves explicit datum/uhrzeit/bearbeiter when provided", async () => {
      await handleSubscriptionTool(
        "openxe-create-crm-document",
        {
          typ: "notiz",
          betreff: "Test",
          adresse_from: 1,
          datum: "2025-01-15",
          uhrzeit: "09:30:00",
          bearbeiter: "Max",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.datum).toBe("2025-01-15");
      expect(postedData.uhrzeit).toBe("09:30:00");
      expect(postedData.bearbeiter).toBe("Max");
    });

    it("posts to /v1/crmdokumente", async () => {
      await handleSubscriptionTool(
        "openxe-create-crm-document",
        {
          typ: "email",
          betreff: "Follow-up",
          adresse_from: 1,
          adresse_to: 3,
          content: "Test content",
        },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.post).toHaveBeenCalledWith(
        "/v1/crmdokumente",
        expect.objectContaining({
          typ: "email",
          betreff: "Follow-up",
          adresse_from: 1,
          adresse_to: 3,
          content: "Test content",
        })
      );
    });
  });

  // --- Wiedervorlage: auto-set datum_angelegt/zeit_angelegt/oeffentlich/bearbeiter ---

  describe("openxe-create-resubmission", () => {
    it("auto-sets datum_angelegt to today when not provided", async () => {
      const today = localDateString(new Date());

      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Test Aufgabe",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.datum_angelegt).toBe(today);
    });

    it("auto-sets zeit_angelegt when not provided", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Test Aufgabe",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.zeit_angelegt).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("auto-sets oeffentlich to 1 when not provided", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Test Aufgabe",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.oeffentlich).toBe(1);
    });

    it("auto-sets bearbeiter to adresse value when adresse provided but bearbeiter not", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Test Aufgabe",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
          adresse: 3,
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.bearbeiter).toBe(3);
    });

    it("does not override explicit bearbeiter", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Test Aufgabe",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
          adresse: 3,
          bearbeiter: "Admin",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.bearbeiter).toBe("Admin");
    });

    it("preserves oeffentlich=0 when explicitly set", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Privat Task",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
          oeffentlich: 0,
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.oeffentlich).toBe(0);
    });

    it("posts to /v1/wiedervorlagen", async () => {
      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "Wichtig",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
          prio: 1,
          adresse: 3,
        },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.post).toHaveBeenCalledWith(
        "/v1/wiedervorlagen",
        expect.objectContaining({
          bezeichnung: "Wichtig",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
          prio: 1,
          adresse: 3,
        })
      );
    });
  });

  // --- Regression: timezone-safe local date defaults ---
  //
  // IMPORTANT: Skipped on pure-UTC hosts (common in CI). The regression (old
  // toISOString() returning previous UTC day at local-midnight+offset) only
  // reproduces when host TZ has a non-zero UTC offset. Under UTC both the old
  // and new impls yield the same string, making the test vacuous. Run locally
  // with TZ=Europe/Berlin (or any non-UTC zone) to exercise these.
  const isUtcHost = new Date().getTimezoneOffset() === 0;
  describe.skipIf(isUtcHost)("local-date regression (timezone)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("crm-document datum uses local calendar day at local midnight (not UTC)", async () => {
      // Local April 1 at 00:30 — under any timezone with positive UTC offset
      // (e.g. Europe/Berlin), the old toISOString()-path serialized as
      // previous-day-in-UTC. localDateString must always yield 2026-04-01.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 1, 0, 30, 0, 0));

      await handleSubscriptionTool(
        "openxe-create-crm-document",
        { typ: "notiz", betreff: "TZ", adresse_from: 1 },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.datum).toBe("2026-04-01");
    });

    it("resubmission datum_angelegt uses local calendar day at local midnight (not UTC)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 1, 0, 30, 0, 0));

      await handleSubscriptionTool(
        "openxe-create-resubmission",
        {
          bezeichnung: "TZ Test",
          datum_erinnerung: "2026-04-05",
          zeit_erinnerung: "10:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      const postedData = mockClient.post.mock.calls[0][1];
      expect(postedData.datum_angelegt).toBe("2026-04-01");
    });
  });

  // --- Schema definitions include new fields ---

  describe("tool definitions", () => {
    it("CRM document schema includes uhrzeit and bearbeiter", () => {
      const crmDef = SUBSCRIPTION_TOOL_DEFINITIONS.find(
        (t) => t.name === "openxe-create-crm-document"
      );
      expect(crmDef).toBeDefined();
      const schema = crmDef!.inputSchema as Record<string, unknown>;
      const props = (schema as any).properties;
      expect(props).toHaveProperty("uhrzeit");
      expect(props).toHaveProperty("bearbeiter");
      expect(props).toHaveProperty("datum");
    });

    it("Resubmission schema includes datum_angelegt, zeit_angelegt, oeffentlich", () => {
      const resubDef = SUBSCRIPTION_TOOL_DEFINITIONS.find(
        (t) => t.name === "openxe-create-resubmission"
      );
      expect(resubDef).toBeDefined();
      const schema = resubDef!.inputSchema as Record<string, unknown>;
      const props = (schema as any).properties;
      expect(props).toHaveProperty("datum_angelegt");
      expect(props).toHaveProperty("zeit_angelegt");
      expect(props).toHaveProperty("oeffentlich");
    });
  });

  // --- Truncation warning on non-JSON formats ---

  describe("list-subscriptions truncation warning on table/csv/ids", () => {
    /** Build N subscription records that survive the DEL filter. */
    function makeSubscriptions(count: number) {
      const records: any[] = [];
      for (let i = 1; i <= count; i++) {
        records.push({
          id: i,
          bezeichnung: `Abo ${i}`,
          adresse: 100 + i,
          artikel: 200 + i,
          preisart: "monat",
          preis: 9.99,
          menge: 1,
        });
      }
      return records;
    }

    /** Mock that returns `total` records split across pages of size 100. */
    function mockMultiPage(total: number) {
      const all = makeSubscriptions(total);
      mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
        const page = parseInt(params?.page ?? "1", 10);
        const items = parseInt(params?.items ?? "100", 10);
        const start = (page - 1) * items;
        const slice = all.slice(start, start + items);
        return Promise.resolve({
          data: slice,
          pagination: { totalCount: total, page, itemsPerPage: items },
        });
      });
    }

    it("format=table: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      mockMultiPage(60);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { format: "table" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[1].text).toMatch(/WARNUNG.*abgeschnitten/);
      expect(result.content[1].text).toMatch(/50/);
    });

    it("format=csv: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      mockMultiPage(60);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { format: "csv" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[1].text).toMatch(/WARNUNG.*abgeschnitten/);
    });

    it("format=ids: appends WARNUNG as content[1] when >MAX_LIST_RESULTS records", async () => {
      mockMultiPage(60);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { format: "ids" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
      expect(result.content[1].text).toMatch(/WARNUNG.*abgeschnitten/);
    });

    it("format=table: no warning when result set is small", async () => {
      mockMultiPage(5);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { format: "table", limit: 10 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).not.toMatch(/WARNUNG/);
    });

    it("format=table with limit=150 + 200 records: warning says 150, not 50", async () => {
      // Effective cap = 150 -> warning must cite 150, not MAX_LIST_RESULTS (50).
      mockMultiPage(200);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { limit: 150, format: "table" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[1].text).toMatch(/WARNUNG.*150.*abgeschnitten/);
      expect(result.content[1].text).not.toMatch(/nach 50/);
    });
  });

  // --- Other handlers still work ---

  describe("other handlers", () => {
    it("server-time calls legacyPost", async () => {
      mockClient.legacyPost.mockResolvedValue({ time: "2026-04-01 12:00:00" });

      const result = await handleSubscriptionTool(
        "openxe-server-time",
        {},
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith("ServerTimeGet", {});
      expect(result.isError).toBeUndefined();
    });

    it("returns error for unknown tool", async () => {
      const result = await handleSubscriptionTool(
        "openxe-unknown-tool",
        {},
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });

  // Regression tests for Task P: aggregate and sort_field must operate on the
  // full dataset, not just the first MAX_LIST_RESULTS (=50) records. Mirrors
  // the read-tools / document-read-tools coverage so the subscription list
  // path can't silently drift back to the windowed behaviour.
  describe("aggregate/sort_field run on full dataset (subscriptions)", () => {
    /** Mock /v1/aboartikel with multi-page pagination. */
    function mockMultiPageAboartikel(all: any[]) {
      mockClient.get.mockImplementation((_path: string, params?: Record<string, any>) => {
        const page = parseInt(params?.page ?? "1", 10);
        const items = parseInt(params?.items ?? "100", 10);
        const start = (page - 1) * items;
        const slice = all.slice(start, start + items);
        return Promise.resolve({
          data: slice,
          pagination: { totalCount: all.length, page, itemsPerPage: items },
        });
      });
    }

    it("list-subscriptions aggregate:count on 150 records (2 pages) returns 150 not 50", async () => {
      const all: any[] = [];
      for (let i = 1; i <= 150; i++) {
        all.push({ id: i, bezeichnung: `Abo ${i}`, adresse: 1000 + i, preis: 10 });
      }
      mockMultiPageAboartikel(all);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { aggregate: "count" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      // Without fetchAll on aggregate the handler would stop after the first
      // page and report 50 — the Task-P fix forces the full scan.
      expect(parsed.count).toBe(150);

      const pages = mockClient.get.mock.calls
        .map((c: any[]) => c[1]?.page)
        .filter((p: string | undefined): p is string => p !== undefined);
      expect(pages).toContain("1");
      expect(pages).toContain("2");
    });

    it("list-subscriptions sort_field='bezeichnung' limit=3 picks the global top-3, not the top-3 of the first 50", async () => {
      const all: any[] = [];
      // IDs 1..100 with names that sort AFTER the page-2 entries, so the
      // lexicographically smallest 3 are deliberately on page 2.
      for (let i = 1; i <= 100; i++) {
        all.push({ id: i, bezeichnung: `Zzz-${String(i).padStart(3, "0")}`, adresse: i, preis: 10 });
      }
      // IDs 101, 102, 103 on page 2 with names that will sort first.
      for (let i = 101; i <= 103; i++) {
        all.push({ id: i, bezeichnung: `Aaa-${String(i).padStart(3, "0")}`, adresse: i, preis: 10 });
      }
      // Pad page 2 to 150 total.
      for (let i = 104; i <= 150; i++) {
        all.push({ id: i, bezeichnung: `Mmm-${String(i).padStart(3, "0")}`, adresse: i, preis: 10 });
      }
      mockMultiPageAboartikel(all);

      const result = await handleSubscriptionTool(
        "openxe-list-subscriptions",
        { sort_field: "bezeichnung", sort_order: "asc", limit: 3 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      // The true global top-3 sits on page 2. Without the full-scan fix the
      // handler would have returned Zzz-001..Zzz-003 from page 1.
      expect(parsed.data.map((r: any) => r.id)).toEqual([101, 102, 103]);

      const pages = mockClient.get.mock.calls
        .map((c: any[]) => c[1]?.page)
        .filter((p: string | undefined): p is string => p !== undefined);
      expect(pages).toContain("1");
      expect(pages).toContain("2");
    });
  });
});
