import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DISCOVER_TOOL_DEFINITION,
  ROUTER_TOOL_DEFINITION,
  handleDiscover,
  handleRouter,
  ACTION_REGISTRY,
  CATEGORY_ORDER,
} from "../../src/tools/router.js";
import { OpenXEClient } from "../../src/client/openxe-client.js";

describe("Router Tools", () => {
  // --- Discover ---

  describe("openxe-discover", () => {
    it("has correct tool definition", () => {
      expect(DISCOVER_TOOL_DEFINITION.name).toBe("openxe-discover");
      expect(DISCOVER_TOOL_DEFINITION.description).toContain("verfuegbare");
    });

    it("returns all categories when no filter", () => {
      const result = handleDiscover({});
      const text = result.content[0].text;

      expect(text).toContain("=== Stammdaten ===");
      expect(text).toContain("=== Belege ===");
      expect(text).toContain("=== Shop");
      expect(text).toContain("=== System ===");
    });

    it("returns all categories when category=alle", () => {
      const result = handleDiscover({ category: "alle" });
      const text = result.content[0].text;

      expect(text).toContain("=== Stammdaten ===");
      expect(text).toContain("=== Belege ===");
    });

    it("filters to stammdaten only", () => {
      const result = handleDiscover({ category: "stammdaten" });
      const text = result.content[0].text;

      expect(text).toContain("=== Stammdaten ===");
      expect(text).not.toContain("=== Belege ===");
      expect(text).not.toContain("=== System ===");
      expect(text).toContain("list-addresses");
      expect(text).toContain("list-articles");
    });

    it("filters to belege only", () => {
      const result = handleDiscover({ category: "belege" });
      const text = result.content[0].text;

      expect(text).toContain("=== Belege ===");
      expect(text).not.toContain("=== Stammdaten ===");
      expect(text).toContain("list-orders");
      expect(text).toContain("create-order");
    });

    it("filters to system only", () => {
      const result = handleDiscover({ category: "system" });
      const text = result.content[0].text;

      expect(text).toContain("=== System ===");
      expect(text).toContain("server-time");
      expect(text).not.toContain("=== Stammdaten ===");
    });

    it("includes usage hint", () => {
      const result = handleDiscover({});
      const text = result.content[0].text;
      expect(text).toContain("openxe");
      expect(text).toContain("action=");
    });

    it("lists all registered actions", () => {
      const result = handleDiscover({});
      const text = result.content[0].text;

      // Spot-check key actions are present
      for (const action of [
        "list-addresses",
        "get-address",
        "list-orders",
        "get-order",
        "create-order",
        "server-time",
      ]) {
        expect(text).toContain(action);
      }
    });
  });

  // --- Router ---

  describe("openxe (router)", () => {
    let mockClient: {
      get: ReturnType<typeof vi.fn>;
      post: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      legacyPost: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockClient = {
        get: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
        post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
        put: vi.fn().mockResolvedValue({ data: { id: 1 } }),
        delete: vi.fn().mockResolvedValue({}),
        legacyPost: vi.fn().mockResolvedValue({ data: { id: 1 }, success: true }),
      };
    });

    it("has correct tool definition", () => {
      expect(ROUTER_TOOL_DEFINITION.name).toBe("openxe");
      expect(ROUTER_TOOL_DEFINITION.description).toContain("openxe-discover");
    });

    it("dispatches list-addresses to read handler", async () => {
      mockClient.get.mockResolvedValue({
        data: [{ id: 1, name: "Test" }],
        pagination: { page: 1, pages: 1 },
      });

      const result = await handleRouter(
        { action: "list-addresses", params: { kundennummer: "10001" } },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/adressen",
        expect.objectContaining({ kundennummer: "10001" })
      );
    });

    it("dispatches get-address to read handler", async () => {
      mockClient.get.mockResolvedValue({
        data: { id: 42, name: "Test Customer" },
      });

      const result = await handleRouter(
        { action: "get-address", params: { id: 42 } },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.get).toHaveBeenCalledWith("/v1/adressen/42");
    });

    it("dispatches list-orders to document-read handler", async () => {
      mockClient.get.mockResolvedValue({
        data: [{ id: 1, belegnr: "AU-2026-0001" }],
        pagination: {},
      });

      const result = await handleRouter(
        { action: "list-orders", params: { status: "freigegeben" } },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/belege/auftraege",
        expect.objectContaining({ status: "freigegeben" })
      );
    });

    it("dispatches create-order to document handler", async () => {
      mockClient.legacyPost.mockResolvedValue({
        data: { id: 99 },
        success: true,
      });

      const result = await handleRouter(
        {
          action: "create-order",
          params: {
            adresse: 1,
            positionen: [{ nummer: "ART-001", menge: 2 }],
          },
        },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "AuftragCreate",
        expect.any(Object)
      );
    });

    it("dispatches create-address to address handler", async () => {
      mockClient.legacyPost.mockResolvedValue({
        data: { id: 5, kundennummer: "10099" },
      });

      const result = await handleRouter(
        {
          action: "create-address",
          params: { typ: "kunde", name: "Neuer Kunde" },
        },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "AdresseCreate",
        expect.objectContaining({ name: "Neuer Kunde" })
      );
    });

    it("dispatches server-time to subscription handler", async () => {
      mockClient.legacyPost.mockResolvedValue({
        data: { time: "2026-04-01 12:00:00" },
      });

      const result = await handleRouter(
        { action: "server-time", params: {} },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ServerTimeGet",
        expect.any(Object)
      );
    });

    it("returns error for unknown action", async () => {
      const result = await handleRouter(
        { action: "nonexistent-action", params: {} },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unbekannte Aktion");
      expect(result.content[0].text).toContain("nonexistent-action");
    });

    it("returns error with list of available actions for unknown action", async () => {
      const result = await handleRouter(
        { action: "does-not-exist", params: {} },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBe(true);
      // Should list available actions
      expect(result.content[0].text).toContain("list-addresses");
      expect(result.content[0].text).toContain("list-orders");
    });

    it("works with empty params", async () => {
      mockClient.get.mockResolvedValue({
        data: [{ id: 1, name: "Test" }],
        pagination: {},
      });

      const result = await handleRouter(
        { action: "list-addresses" },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
    });
  });

  // --- Registry consistency ---

  describe("ACTION_REGISTRY", () => {
    it("has unique action names", () => {
      const names = ACTION_REGISTRY.map((e) => e.action);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it("all entries have valid categories", () => {
      for (const entry of ACTION_REGISTRY) {
        expect(CATEGORY_ORDER).toContain(entry.category);
      }
    });

    it("all entries have valid handler types", () => {
      const validHandlers = ["read", "document-read", "document", "address", "subscription"];
      for (const entry of ACTION_REGISTRY) {
        expect(validHandlers).toContain(entry.handler);
      }
    });

    it("has at least 30 actions (covers major functionality)", () => {
      expect(ACTION_REGISTRY.length).toBeGreaterThanOrEqual(30);
    });
  });
});
