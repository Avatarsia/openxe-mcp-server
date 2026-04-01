import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient, OpenXEApiError } from "../../src/client/openxe-client.js";
import {
  handleAddressTool,
  ADDRESS_TOOL_DEFINITIONS,
} from "../../src/tools/address-tools.js";

describe("Address Tools", () => {
  let mockClient: {
    legacyPost: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      legacyPost: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
  });

  it("defines all address tools", () => {
    const names = ADDRESS_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-create-address");
    expect(names).toContain("openxe-edit-address");
    expect(names).toContain("openxe-create-delivery-address");
    expect(names).toContain("openxe-edit-delivery-address");
    expect(names).toContain("openxe-delete-delivery-address");
  });

  it("creates address via Legacy API", async () => {
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 42 },
    });

    const result = await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Acme GmbH", email: "info@acme.de" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith("AdresseCreate", {
      typ: "firma",
      name: "Acme GmbH",
      email: "info@acme.de",
      kundennummer: "NEU",
    });
    expect(result.content[0].text).toContain("42");
  });

  it("edits address via REST v1 PUT first", async () => {
    mockClient.put.mockResolvedValue({
      data: { id: 42, email: "new@acme.de" },
    });

    const result = await handleAddressTool(
      "openxe-edit-address",
      { id: 42, email: "new@acme.de" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.put).toHaveBeenCalledWith("/v1/adressen/42", {
      email: "new@acme.de",
    });
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("REST v1 PUT");
  });

  it("falls back to Legacy API when REST v1 PUT fails", async () => {
    mockClient.put.mockRejectedValue(
      new OpenXEApiError(7499, 500, "Internal Server Error")
    );
    mockClient.legacyPost.mockResolvedValue({
      success: true,
      data: { id: 42 },
    });

    const result = await handleAddressTool(
      "openxe-edit-address",
      { id: 42, email: "new@acme.de" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.put).toHaveBeenCalledWith("/v1/adressen/42", {
      email: "new@acme.de",
    });
    expect(mockClient.legacyPost).toHaveBeenCalledWith("AdresseEdit", {
      adresse: { id: 42, email: "new@acme.de" },
    });
    expect(result.content[0].text).toContain("Legacy API");
    expect(result.content[0].text).toContain("fallback");
  });

  it("creates delivery address via REST v1", async () => {
    mockClient.post.mockResolvedValue({
      data: { id: 7, name: "Warehouse Berlin", adresse: 42 },
    });

    const result = await handleAddressTool(
      "openxe-create-delivery-address",
      { name: "Warehouse Berlin", adresse: 42, land: "DE" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/v1/lieferadressen", {
      name: "Warehouse Berlin",
      adresse: 42,
      land: "DE",
    });
  });

  it("edits delivery address via REST v1", async () => {
    mockClient.put.mockResolvedValue({
      data: { id: 7, name: "Warehouse Munich" },
    });

    const result = await handleAddressTool(
      "openxe-edit-delivery-address",
      { id: 7, name: "Warehouse Munich" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.put).toHaveBeenCalledWith("/v1/lieferadressen/7", {
      name: "Warehouse Munich",
    });
  });

  it("deletes delivery address via REST v1", async () => {
    mockClient.delete.mockResolvedValue(undefined);

    const result = await handleAddressTool(
      "openxe-delete-delivery-address",
      { id: 7 },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.delete).toHaveBeenCalledWith("/v1/lieferadressen/7");
  });
});
