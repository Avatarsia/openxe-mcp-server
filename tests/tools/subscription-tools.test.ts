import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleSubscriptionTool,
  SUBSCRIPTION_TOOL_DEFINITIONS,
} from "../../src/tools/subscription-tools.js";

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
      const today = new Date().toISOString().split("T")[0];

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
      const today = new Date().toISOString().split("T")[0];

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
});
