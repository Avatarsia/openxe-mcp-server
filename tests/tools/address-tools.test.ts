import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient, OpenXEApiError } from "../../src/client/openxe-client.js";
import {
  handleAddressTool,
  ADDRESS_TOOL_DEFINITIONS,
} from "../../src/tools/address-tools.js";

describe("Address Tools", () => {
  let mockClient: {
    legacyPost: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      legacyPost: vi.fn(),
      get: vi.fn(),
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

  it("creates address via REST v1 POST /v1/adressen", async () => {
    mockClient.post.mockResolvedValue({ data: { id: 42 } });

    const result = await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Acme GmbH", email: "info@acme.de", confirm: true },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/v1/adressen", {
      typ: "firma",
      name: "Acme GmbH",
      email: "info@acme.de",
      kundennummer: "NEU",
    });
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("42");
  });

  it("returns a dry-run preview and does not write without confirm", async () => {
    const result = await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Acme GmbH", iban: "DE89370400440532013000" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).not.toHaveBeenCalled();
    const text = result.content[0].text;
    expect(text).toContain('"dry_run": true');
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("DE89370400440532013000");
  });

  it("restores the street without the trailing space OpenXE adds", async () => {
    mockClient.post.mockResolvedValue({ data: { id: 31 } });
    mockClient.put.mockResolvedValue({ data: {} });

    await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Rubis Outils SA", strasse: "Via Lische 14", rolle: "Lieferant", confirm: true },
      mockClient as unknown as OpenXEClient
    );
    expect(mockClient.put).toHaveBeenCalledWith("/v1/adressen/31", { strasse: "Via Lische 14" });
  });

  it("creates a pure supplier with NEU lieferantennummer and no kundennummer", async () => {
    mockClient.post.mockResolvedValue({ data: { id: 9 } });

    await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Lief GmbH", rolle: "Lieferant", confirm: true },
      mockClient as unknown as OpenXEClient
    );
    const [, payload] = mockClient.post.mock.calls[0];
    expect(payload.lieferantennummer).toBe("NEU");
    expect(payload.kundennummer).toBeUndefined();
  });

  it("passes an explicit kundennummer through and lets the ERP assign NEU", async () => {
    mockClient.post.mockResolvedValue({ data: { id: 7 } });

    await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Kunde AG", kundennummer: "10001", confirm: true },
      mockClient as unknown as OpenXEClient
    );
    expect(mockClient.post.mock.calls[0][1].kundennummer).toBe("10001");

    mockClient.post.mockClear();
    await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Auto AG", confirm: true },
      mockClient as unknown as OpenXEClient
    );
    expect(mockClient.post.mock.calls[0][1].kundennummer).toBe("NEU");
  });

  it("finds a supplier after the known 404 read-back error without creating twice", async () => {
    mockClient.post.mockRejectedValue(new OpenXEApiError(7452, 404, "Adresse mit Kundennummer '70006' nicht gefunden"));
    mockClient.get.mockResolvedValue({
      data: [
        { id: 3, name: "Anderer", lieferantennummer: "70001" },
        { id: 30, name: "Rubis Outils SA", lieferantennummer: "70006" },
      ],
      pagination: { page_current: 1, page_last: 1 },
    });
    mockClient.put.mockResolvedValue({ data: {} });

    const result = await handleAddressTool(
      "openxe-create-address",
      { typ: "firma", name: "Rubis Outils SA", strasse: "Via Lische 14", rolle: "Lieferant", confirm: true },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledTimes(1);
    expect(mockClient.put).toHaveBeenCalledWith("/v1/adressen/30", { strasse: "Via Lische 14" });
    expect(result.content[0].text).toContain("30");
  });

  it("rethrows other create errors unchanged", async () => {
    mockClient.post.mockRejectedValue(new OpenXEApiError(7499, 500, "Internal Server Error"));

    await expect(
      handleAddressTool(
        "openxe-create-address",
        { typ: "firma", name: "Fehler GmbH", rolle: "Lieferant", confirm: true },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toThrow("Internal Server Error");
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it("edits address via REST v1 PUT first", async () => {
    mockClient.put.mockResolvedValue({
      data: { id: 42, email: "new@acme.de" },
    });

    const result = await handleAddressTool(
      "openxe-edit-address",
      { id: 42, email: "new@acme.de", confirm: true },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.put).toHaveBeenCalledWith("/v1/adressen/42", {
      email: "new@acme.de",
    });
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("REST v1 PUT");
  });

  it("does not fall back to Legacy API when REST v1 PUT fails", async () => {
    mockClient.put.mockRejectedValue(
      new OpenXEApiError(7499, 500, "Internal Server Error")
    );

    await expect(
      handleAddressTool(
        "openxe-edit-address",
        { id: 42, email: "new@acme.de", confirm: true },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toThrow("Internal Server Error");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("creates delivery address via REST v1", async () => {
    mockClient.post.mockResolvedValue({
      data: { id: 7, name: "Warehouse Berlin", adresse: 42 },
    });

    await handleAddressTool(
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

    await handleAddressTool(
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

    await handleAddressTool(
      "openxe-delete-delivery-address",
      { id: 7, confirm: true },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.delete).toHaveBeenCalledWith("/v1/lieferadressen/7");
  });

  it("does not fall back to Legacy API when REST v1 delivery address create fails", async () => {
    mockClient.post.mockRejectedValue(new OpenXEApiError(7499, 500, "Internal Server Error"));

    await expect(
      handleAddressTool(
        "openxe-create-delivery-address",
        { name: "Warehouse Berlin", adresse: 42, land: "DE" },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toThrow("Internal Server Error");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("does not edit or delete without confirm", async () => {
    const edit = await handleAddressTool("openxe-edit-address", { id: 42, email: "x@acme.de" }, mockClient as unknown as OpenXEClient);
    const del = await handleAddressTool("openxe-delete-delivery-address", { id: 7 }, mockClient as unknown as OpenXEClient);
    expect(mockClient.put).not.toHaveBeenCalled();
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    expect(mockClient.delete).not.toHaveBeenCalled();
    expect(edit.content[0].text).toContain("dry_run");
    expect(del.content[0].text).toContain("dry_run");
  });
});
