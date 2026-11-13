import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleArticleTool,
  ARTICLE_TOOL_DEFINITIONS,
  articleTypExt,
} from "../../src/tools/article-tools.js";

describe("Article Tools", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

  const base = {
    name_de: "Tweezers Classic SA",
    nummer: "1K102",
    artikelkategorie: "Handelsware",
    standardlieferant: 27,
    hersteller: "Rubis Outils SA",
    herstellernummer: "1K102",
    ean: "7612947004893",
    zolltarifnummer: "82032000",
    herkunftsland: "ch",
    lagerartikel: true,
  };

  beforeEach(() => {
    mockClient = { legacyPost: vi.fn(), post: vi.fn(), put: vi.fn() };
  });

  it("defines the create-article tool", () => {
    expect(ARTICLE_TOOL_DEFINITIONS.map((t) => t.name)).toContain("openxe-create-article");
  });

  it("maps Handelsware to typ_ext 1 and known keys", () => {
    expect(articleTypExt("Handelsware")).toBe("1");
    expect(articleTypExt("7")).toBe("7");
  });

  it("returns a dry-run preview and writes nothing without confirm", async () => {
    const result = await handleArticleTool("openxe-create-article", base, mockClient as unknown as OpenXEClient);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    const text = result.content[0].text;
    expect(text).toContain('"dry_run": true');
    expect(text).toContain('"typ_ext": "1"');
    expect(text).toContain('"adresse": "27"');
    expect(text).toContain('"herkunftsland": "CH"');
    expect(text).toContain('"lagerartikel": "1"');
  });

  it("creates the article via Legacy ArtikelCreate with confirm", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "15", nummer: "1K102" } });

    const result = await handleArticleTool(
      "openxe-create-article",
      { ...base, confirm: true },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelCreate", {
      name_de: "Tweezers Classic SA",
      nummer: "1K102",
      typ_ext: "1",
      adresse: "27",
      hersteller: "Rubis Outils SA",
      herstellernummer: "1K102",
      ean: "7612947004893",
      zolltarifnummer: "82032000",
      herkunftsland: "CH",
      lagerartikel: "1",
    });
    expect(result.content[0].text).toContain("15");
  });

  it("sends the purchase price as nested einkaufspreise and creates a new supplier by name", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "18" } });

    await handleArticleTool(
      "openxe-create-article",
      {
        ...base,
        einkaufspreis: { preis: 5, lieferantname: "Neuer Lieferant", bestellnummer: "E2E-1" },
        confirm: true,
      },
      mockClient as unknown as OpenXEClient
    );

    const payload = mockClient.legacyPost.mock.calls[0][1];
    expect(payload.einkaufspreise).toEqual({
      staffelpreis: {
        ab_menge: "1",
        preis: "5",
        waehrung: "CHF",
        lieferantennummer: "",
        lieferantname: "Neuer Lieferant",
        bestellnummer: "E2E-1",
        bezeichnunglieferant: "Tweezers Classic SA",
      },
    });
  });

  it("requires a supplier number or name for the purchase price", async () => {
    await expect(
      handleArticleTool(
        "openxe-create-article",
        { ...base, einkaufspreis: { preis: 5 }, confirm: true },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toThrow();
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("rejects a missing required field", async () => {
    await expect(
      handleArticleTool("openxe-create-article", { name_de: "Ohne Nummer", artikelkategorie: "Handelsware", confirm: true }, mockClient as unknown as OpenXEClient)
    ).rejects.toThrow();
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });
});
