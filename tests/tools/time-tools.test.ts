import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleTimeTool,
  TIME_TOOL_DEFINITIONS,
} from "../../src/tools/time-tools.js";

describe("Time Tools", () => {
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

  // --- Tool Definitions ---

  describe("tool definitions", () => {
    it("exports exactly 7 tool definitions", () => {
      expect(TIME_TOOL_DEFINITIONS).toHaveLength(7);
    });

    it("all definitions have name, description, inputSchema", () => {
      for (const def of TIME_TOOL_DEFINITIONS) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.inputSchema).toBeDefined();
      }
    });

    it("has the correct tool names", () => {
      const names = TIME_TOOL_DEFINITIONS.map((d) => d.name);
      expect(names).toContain("openxe-clock-status");
      expect(names).toContain("openxe-clock-action");
      expect(names).toContain("openxe-clock-summary");
      expect(names).toContain("openxe-list-time-entries");
      expect(names).toContain("openxe-create-time-entry");
      expect(names).toContain("openxe-edit-time-entry");
      expect(names).toContain("openxe-delete-time-entry");
    });
  });

  // --- Stechuhr Status ---

  describe("openxe-clock-status", () => {
    it("calls legacyPost with StechuhrStatusGet and adresse", async () => {
      await handleTimeTool(
        "openxe-clock-status",
        { adresse: 42 },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "StechuhrStatusGet",
        { adresse: 42 }
      );
    });

    it("returns result from legacyPost", async () => {
      mockClient.legacyPost.mockResolvedValue({
        success: true,
        data: { status: "eingestempelt" },
      });

      const result = await handleTimeTool(
        "openxe-clock-status",
        { adresse: 42 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("eingestempelt");
    });

    it("rejects missing adresse", async () => {
      await expect(
        handleTimeTool(
          "openxe-clock-status",
          {},
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Stechuhr Action ---

  describe("openxe-clock-action", () => {
    it("calls legacyPost with StechuhrStatusSet and cmd", async () => {
      await handleTimeTool(
        "openxe-clock-action",
        { cmd: "kommen" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "StechuhrStatusSet",
        { cmd: "kommen" }
      );
    });

    it("passes optional user and adresse params", async () => {
      await handleTimeTool(
        "openxe-clock-action",
        { cmd: "gehen", user: 5, adresse: 42 },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "StechuhrStatusSet",
        { cmd: "gehen", user: 5, adresse: 42 }
      );
    });

    it("does NOT send user/adresse when not provided", async () => {
      await handleTimeTool(
        "openxe-clock-action",
        { cmd: "pausestart" },
        mockClient as unknown as OpenXEClient
      );

      const calledParams = mockClient.legacyPost.mock.calls[0][1];
      expect(calledParams).toEqual({ cmd: "pausestart" });
      expect(calledParams).not.toHaveProperty("user");
      expect(calledParams).not.toHaveProperty("adresse");
    });

    it("accepts all valid cmd values", async () => {
      for (const cmd of ["kommen", "gehen", "pausestart", "pausestop"]) {
        mockClient.legacyPost.mockClear();
        await handleTimeTool(
          "openxe-clock-action",
          { cmd },
          mockClient as unknown as OpenXEClient
        );
        expect(mockClient.legacyPost).toHaveBeenCalledWith(
          "StechuhrStatusSet",
          expect.objectContaining({ cmd })
        );
      }
    });

    it("rejects invalid cmd value", async () => {
      await expect(
        handleTimeTool(
          "openxe-clock-action",
          { cmd: "invalid" },
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Stechuhr Summary ---

  describe("openxe-clock-summary", () => {
    it("calls legacyPost with StechuhrSummary and adresse", async () => {
      await handleTimeTool(
        "openxe-clock-summary",
        { adresse: 7 },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "StechuhrSummary",
        { adresse: 7 }
      );
    });

    it("rejects missing adresse", async () => {
      await expect(
        handleTimeTool(
          "openxe-clock-summary",
          {},
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Zeiterfassung Get (list) ---

  describe("openxe-list-time-entries", () => {
    it("calls legacyPost with ZeiterfassungGet and no params when none given", async () => {
      await handleTimeTool(
        "openxe-list-time-entries",
        {},
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungGet",
        {}
      );
    });

    it("passes all filter params", async () => {
      await handleTimeTool(
        "openxe-list-time-entries",
        {
          adresse: 3,
          kundennummer: "10001",
          projekt: 5,
          von: "2026-01-01",
          bis: "2026-03-31",
          offset: 10,
          limit: 50,
        },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungGet",
        {
          adresse: 3,
          kundennummer: "10001",
          projekt: 5,
          von: "2026-01-01",
          bis: "2026-03-31",
          offset: 10,
          limit: 50,
        }
      );
    });

    it("omits undefined optional params", async () => {
      await handleTimeTool(
        "openxe-list-time-entries",
        { adresse: 3 },
        mockClient as unknown as OpenXEClient
      );

      const calledParams = mockClient.legacyPost.mock.calls[0][1];
      expect(calledParams).toEqual({ adresse: 3 });
      expect(calledParams).not.toHaveProperty("kundennummer");
      expect(calledParams).not.toHaveProperty("projekt");
    });
  });

  // --- Zeiterfassung Create ---

  describe("openxe-create-time-entry", () => {
    it("calls legacyPost with ZeiterfassungCreate using adresse", async () => {
      await handleTimeTool(
        "openxe-create-time-entry",
        {
          adresse: 3,
          aufgabe: "Entwicklung",
          von: "2026-04-01 08:00:00",
          bis: "2026-04-01 12:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungCreate",
        {
          adresse: 3,
          aufgabe: "Entwicklung",
          von: "2026-04-01 08:00:00",
          bis: "2026-04-01 12:00:00",
        }
      );
    });

    it("calls legacyPost with ZeiterfassungCreate using mitarbeiternummer", async () => {
      await handleTimeTool(
        "openxe-create-time-entry",
        {
          mitarbeiternummer: "MA-001",
          aufgabe: "Support",
          von: "2026-04-01 13:00:00",
          bis: "2026-04-01 17:00:00",
        },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungCreate",
        {
          mitarbeiternummer: "MA-001",
          aufgabe: "Support",
          von: "2026-04-01 13:00:00",
          bis: "2026-04-01 17:00:00",
        }
      );
    });

    it("rejects when neither mitarbeiternummer nor adresse is provided", async () => {
      await expect(
        handleTimeTool(
          "openxe-create-time-entry",
          {
            aufgabe: "Test",
            von: "2026-04-01 08:00:00",
            bis: "2026-04-01 12:00:00",
          },
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });

    it("rejects when aufgabe is missing", async () => {
      await expect(
        handleTimeTool(
          "openxe-create-time-entry",
          {
            adresse: 3,
            von: "2026-04-01 08:00:00",
            bis: "2026-04-01 12:00:00",
          },
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Zeiterfassung Edit ---

  describe("openxe-edit-time-entry", () => {
    it("calls legacyPost with ZeiterfassungEdit passing id and fields", async () => {
      await handleTimeTool(
        "openxe-edit-time-entry",
        { id: 99, aufgabe: "Updated task", bis: "2026-04-01 18:00:00" },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungEdit",
        { id: 99, aufgabe: "Updated task", bis: "2026-04-01 18:00:00" }
      );
    });

    it("rejects when id is missing", async () => {
      await expect(
        handleTimeTool(
          "openxe-edit-time-entry",
          { aufgabe: "No ID" },
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Zeiterfassung Delete ---

  describe("openxe-delete-time-entry", () => {
    it("calls legacyPost with ZeiterfassungDelete and id", async () => {
      await handleTimeTool(
        "openxe-delete-time-entry",
        { id: 42 },
        mockClient as unknown as OpenXEClient
      );

      expect(mockClient.legacyPost).toHaveBeenCalledWith(
        "ZeiterfassungDelete",
        { id: 42 }
      );
    });

    it("includes id in success message", async () => {
      const result = await handleTimeTool(
        "openxe-delete-time-entry",
        { id: 42 },
        mockClient as unknown as OpenXEClient
      );

      expect(result.content[0].text).toContain("42");
      expect(result.content[0].text).toContain("geloescht");
    });

    it("rejects when id is missing", async () => {
      await expect(
        handleTimeTool(
          "openxe-delete-time-entry",
          {},
          mockClient as unknown as OpenXEClient
        )
      ).rejects.toThrow();
    });
  });

  // --- Unknown tool ---

  describe("unknown tool", () => {
    it("returns error for unknown tool name", async () => {
      const result = await handleTimeTool(
        "openxe-unknown-time-tool",
        {},
        mockClient as unknown as OpenXEClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });
});
