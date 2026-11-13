import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  ArticleUpdateInput,
  handleArticleTool,
  ARTICLE_TOOL_DEFINITIONS,
  articleTypExt,
  buildArticlePayload,
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
    expect(result.content[0].text).toContain("\"id\": \"15\"");
  });

  it("sends the purchase price as nested einkaufspreise and creates a new supplier by name", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "18" } });

    await handleArticleTool(
      "openxe-create-article",
      {
        ...base,
        einkaufspreis: { preis: 5, lieferantname: "Neuer Lieferant", bestellnummer: "E2E-1", waehrung: "CHF" },
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

  it("create einkaufspreis: requires lieferantname and bestellnummer, a lieferantennummer alone is not enough", async () => {
    await expect(
      handleArticleTool(
        "openxe-create-article",
        { ...base, einkaufspreis: { preis: 5, bestellnummer: "B-1", waehrung: "CHF" }, confirm: true },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool(
        "openxe-create-article",
        { ...base, einkaufspreis: { preis: 5, lieferantennummer: "L-1", bestellnummer: "B-1", waehrung: "CHF" }, confirm: true },
        mockClient as unknown as OpenXEClient
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("create einkaufspreis: lieferantennummer together with lieferantname is accepted", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "1" } });
    await handleArticleTool(
      "openxe-create-article",
      { ...base, einkaufspreis: { preis: 5, lieferantennummer: "L-1", lieferantname: "Rubis", bestellnummer: "B-1", waehrung: "CHF" }, confirm: true },
      mockClient as unknown as OpenXEClient
    );
    expect(mockClient.legacyPost).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing required field", async () => {
    await expect(
      handleArticleTool("openxe-create-article", { name_de: "Ohne Nummer", artikelkategorie: "Handelsware", confirm: true }, mockClient as unknown as OpenXEClient)
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });
});

describe("Article update and purchase price tools", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true, data: {} }) };
  });

  const client = () => mockClient as unknown as OpenXEClient;

  it("defines the update and purchase price tools", () => {
    const names = ARTICLE_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("openxe-update-article");
    expect(names).toContain("openxe-add-article-purchase-price");
  });

  it("update: dry-run writes nothing and shows the ArtikelEdit payload", async () => {
    const result = await handleArticleTool(
      "openxe-update-article",
      { nummer: "1K102", ean: "7612947004893", herkunftsland: "ch", lagerartikel: false },
      client()
    );
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    const text = result.content[0].text;
    expect(text).toContain('"dry_run": true');
    expect(text).toContain('"herkunftsland": "CH"');
    expect(text).toContain('"lagerartikel": "0"');
  });

  it("update: confirm sends ArtikelEdit with only the given fields", async () => {
    await handleArticleTool(
      "openxe-update-article",
      { nummer: "1K102", name_de: "Pinzette", artikelkategorie: "Handelsware", standardlieferant: 27, confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", {
      nummer: "1K102",
      name_de: "Pinzette",
      typ_ext: "1",
      adresse: "27",
    });
  });

  it("update: rejects a call that changes nothing", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: rejects a missing nummer", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { ean: "1234", confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: dry-run writes nothing", async () => {
    const result = await handleArticleTool(
      "openxe-add-article-purchase-price",
      { nummer: "1K102", einkaufspreis: { preis: 4.5, lieferantname: "Rubis", bestellnummer: "B-1", bezeichnunglieferant: "Rubis Artikel", waehrung: "chf" } },
      client()
    );
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    const text = result.content[0].text;
    expect(text).toContain('"dry_run": true');
    expect(text).toContain('"waehrung": "CHF"');
  });

  it("purchase price: confirm sends nested einkaufspreise via ArtikelEdit", async () => {
    await handleArticleTool(
      "openxe-add-article-purchase-price",
      {
        nummer: "1K102",
        einkaufspreis: { preis: 4.5, lieferantennummer: "L-7", lieferantname: "Rubis", bestellnummer: "B-1", bezeichnunglieferant: "Rubis Artikel", waehrung: "CHF", ab_menge: 10 },
        confirm: true,
      },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", {
      nummer: "1K102",
      einkaufspreise: {
        staffelpreis: {
          ab_menge: "10",
          preis: "4.5",
          waehrung: "CHF",
          lieferantennummer: "L-7",
          lieferantname: "Rubis",
          bestellnummer: "B-1",
          bezeichnunglieferant: "Rubis Artikel",
        },
      },
    });
  });

  it("purchase price: requires lieferantname", async () => {
    await expect(
      handleArticleTool(
        "openxe-add-article-purchase-price",
        { nummer: "1K102", einkaufspreis: pp({ lieferantname: undefined }), confirm: true },
        client()
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: lieferantname is required even when lieferantennummer is set", async () => {
    await expect(
      handleArticleTool(
        "openxe-add-article-purchase-price",
        { nummer: "1K102", einkaufspreis: pp({ lieferantname: undefined, lieferantennummer: "L-99999" }), confirm: true },
        client()
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: rounding guard rejects values that the decimal text would not reproduce", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ preis: 1.5e-20 }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("schema and runtime agree on padded input: padded category and country are accepted by both", async () => {
    const create = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-create-article")!;
    const props = (create.inputSchema as { properties: Record<string, { pattern?: string }> }).properties;
    expect(new RegExp(props.artikelkategorie.pattern!).test(" Handelsware ")).toBe(true);
    expect(new RegExp(props.herkunftsland.pattern!).test("   ")).toBe(true);
    // Optional on create: whitespace-only is treated as empty and skipped, so the pattern accepts it.
    expect(new RegExp(props.hersteller.pattern!).test("   ")).toBe(true);
    expect(new RegExp(props.hersteller.pattern!).test("L'Oreal")).toBe(false);
    const result = await handleArticleTool(
      "openxe-create-article",
      { name_de: "Pinzette", nummer: "1K102", artikelkategorie: " Handelsware ", herkunftsland: " ch " },
      client()
    );
    expect(result.content[0].text).toContain('"typ_ext": "1"');
  });

  it("currency: JSON schema pattern matches the runtime rule", () => {
    const create = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-create-article")!;
    const props = (create.inputSchema as { properties: Record<string, { properties?: Record<string, { pattern?: string }> }> }).properties;
    const einkauf = props.einkaufspreis as unknown as { properties: Record<string, { pattern?: string }> };
    const re = new RegExp(einkauf.properties.waehrung.pattern!);
    expect(re.test("CHF")).toBe(true);
    expect(re.test("EU")).toBe(false);
  });

  it("purchase price: writes small numbers without exponent notation", async () => {
    await handleArticleTool(
      "openxe-add-article-purchase-price",
      { nummer: "1K102", einkaufspreis: { preis: 0.0000001, lieferantname: "Rubis", bestellnummer: "B-1", bezeichnunglieferant: "Rubis Artikel", waehrung: "CHF", ab_menge: 1000 }, confirm: true },
      client()
    );
    const sent = mockClient.legacyPost.mock.calls[0][1] as { einkaufspreise: { staffelpreis: Record<string, string> } };
    expect(sent.einkaufspreise.staffelpreis.preis).toBe("0.0000001");
    expect(sent.einkaufspreise.staffelpreis.ab_menge).toBe("1000");
  });

  it("purchase price: description states versioning and the same-price case", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-add-article-purchase-price")!;
    expect(def.description).toContain("the price itself changes nothing");
    expect(def.description).toContain("Retrying with a different price creates another version");
  });

  it("create: skips empty optional fields instead of sending them", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "1" } });
    await handleArticleTool(
      "openxe-create-article",
      { name_de: "Pinzette", nummer: "1K102", artikelkategorie: "Handelsware", hersteller: "", ean: "   ", herkunftsland: "", confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelCreate", {
      name_de: "Pinzette",
      nummer: "1K102",
      typ_ext: "1",
    });
  });

  it("create: trims herkunftsland before validating it", async () => {
    const result = await handleArticleTool(
      "openxe-create-article",
      { name_de: "Pinzette", nummer: "1K102", artikelkategorie: "Handelsware", herkunftsland: " ch " },
      client()
    );
    expect(result.content[0].text).toContain('"herkunftsland": "CH"');
  });

  it("create and update: reject a herkunftsland that is not two letters", async () => {
    await expect(
      handleArticleTool("openxe-create-article", { name_de: "P", nummer: "1", artikelkategorie: "Handelsware", herkunftsland: "12" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1", herkunftsland: " C" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: rejects empty strings instead of clearing stored values", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", ean: "" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", hersteller: "   " }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: JSON schema lists nummer as required and confirm as optional, without allOf", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-update-article")!;
    const schema = def.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain("nummer");
    expect(schema.properties).toHaveProperty("confirm");
    expect(JSON.stringify(schema)).not.toContain("allOf");
  });

  const pp = (overrides: Record<string, unknown> = {}) => ({
    preis: 4.5,
    lieferantname: "Rubis",
    bestellnummer: "B-1",
    bezeichnunglieferant: "Rubis Artikel",
    waehrung: "CHF",
    ...overrides,
  });

  it("purchase price: waehrung is required, there is no silent default", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ waehrung: undefined }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: the standalone tool requires bezeichnunglieferant", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ bezeichnunglieferant: "" }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("quote rejection message names the typographic apostrophe option", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", hersteller: "L'Oréal" }, client())
    ).rejects.toThrow(/U\+2019/);
  });

  it("create: whitespace-only herkunftsland is skipped like other empty values", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "1" } });
    await handleArticleTool(
      "openxe-create-article",
      { name_de: "Pinzette", nummer: "1K102", artikelkategorie: "Handelsware", herkunftsland: "   ", confirm: true },
      client()
    );
    const sent = mockClient.legacyPost.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("herkunftsland");
  });

  it("update: a call whose fields are all undefined is rejected", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", ean: undefined, confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: JSON schema carries the non-empty and country-code rules", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-update-article")!;
    const props = (def.inputSchema as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(props.hersteller.minLength).toBe(1);
    expect(props.herkunftsland.pattern).toBeDefined();
  });

  it("purchase price: requires bestellnummer, because a repeated call would erase it", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ bestellnummer: undefined }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ bestellnummer: "  " }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: rejects NaN, Infinity and negative prices", async () => {
    for (const preis of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      await expect(
        handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ preis }), confirm: true }, client())
      ).rejects.toBeInstanceOf(ZodError);
    }
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: rejects ab_menge 0 and values that would round to zero", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ ab_menge: 0 }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ preis: 1e-25 }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("purchase price: falls back to the article name when bezeichnunglieferant is empty on create", async () => {
    mockClient.legacyPost.mockResolvedValue({ success: true, data: { id: "1" } });
    await handleArticleTool(
      "openxe-create-article",
      { name_de: "Pinzette", nummer: "1K102", artikelkategorie: "Handelsware", einkaufspreis: pp({ bezeichnunglieferant: "" }), confirm: true },
      client()
    );
    const sent = mockClient.legacyPost.mock.calls[0][1] as { einkaufspreise: { staffelpreis: Record<string, string> } };
    expect(sent.einkaufspreise.staffelpreis.bezeichnunglieferant).toBe("Pinzette");
  });

  it("create: rejects einkaufspreis without lieferantname", async () => {
    await expect(
      handleArticleTool(
        "openxe-create-article",
        { name_de: "P", nummer: "1", artikelkategorie: "Handelsware", einkaufspreis: { preis: 5, bestellnummer: "B", waehrung: "CHF" }, confirm: true },
        client()
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: rejects an unknown category name and accepts a numeric id", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", artikelkategorie: "Unbekannt" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();

    await handleArticleTool("openxe-update-article", { nummer: "1K102", artikelkategorie: "7", confirm: true }, client());
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", { nummer: "1K102", typ_ext: "7" });
  });

  it("category ids: 0 and leading zeros are rejected, a plain positive id is accepted", async () => {
    for (const artikelkategorie of ["0", "007"]) {
      await expect(
        handleArticleTool("openxe-update-article", { nummer: "1K102", artikelkategorie }, client())
      ).rejects.toBeInstanceOf(ZodError);
    }
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-update-article")!;
    const pattern = new RegExp((def.inputSchema as { properties: Record<string, { pattern: string }> }).properties.artikelkategorie.pattern);
    expect(pattern.test("0")).toBe(false);
    expect(pattern.test("007")).toBe(false);
    expect(pattern.test("7")).toBe(true);
  });

  it("create: NEW and NEU are rejected as article numbers, in the schema and at runtime", async () => {
    const create = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-create-article")!;
    const pattern = new RegExp((create.inputSchema as { properties: Record<string, { pattern: string }> }).properties.nummer.pattern);
    for (const nummer of ["NEW", "neu", " New "]) {
      expect(pattern.test(nummer)).toBe(false);
      await expect(
        handleArticleTool("openxe-create-article", { name_de: "P", nummer, artikelkategorie: "Handelsware" }, client())
      ).rejects.toBeInstanceOf(ZodError);
    }
    expect(pattern.test("1K102")).toBe(true);
    expect(pattern.test("NEW-1")).toBe(true);
  });

  it("decimal places: preis max 8, ab_menge max 4 (OpenXE column scale)", async () => {
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ preis: 1.123456789 }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ ab_menge: 0.00001 }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
    await handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ preis: 1.12345678, ab_menge: 0.0001 }), confirm: true }, client());
    expect(mockClient.legacyPost).toHaveBeenCalledTimes(1);
  });

  it("negative zero is sent as 0, not -0", async () => {
    await handleArticleTool(
      "openxe-add-article-purchase-price",
      { nummer: "1K102", einkaufspreis: pp({ preis: -0 }), confirm: true },
      client()
    );
    const sent = mockClient.legacyPost.mock.calls[0][1] as { einkaufspreise: { staffelpreis: Record<string, string> } };
    expect(sent.einkaufspreise.staffelpreis.preis).toBe("0");
  });

  it("dry-run warns that sales prices are expired by the OpenXE call", async () => {
    const upd = await handleArticleTool("openxe-update-article", { nummer: "1K102", ean: "123" }, client());
    expect(upd.content[0].text).toContain("Verkaufspreise");
    const price = await handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp() }, client());
    expect(price.content[0].text).toContain("Verkaufspreise");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("text with DEL or C1 control characters is rejected", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", ean: "A\u007fB" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", ean: "A\u0085B" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("text with quotes, backslashes or control characters is rejected", async () => {
    await expect(
      handleArticleTool("openxe-create-article", { name_de: "L'Outil", nummer: "1", artikelkategorie: "Handelsware" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", hersteller: 'Rubis "SA"' }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", ean: "12\\3" }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-add-article-purchase-price", { nummer: "1K102", einkaufspreis: pp({ bestellnummer: "x'y" }), confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("update: sends standardlieferant as adresse", async () => {
    await handleArticleTool("openxe-update-article", { nummer: "1K102", standardlieferant: 27, confirm: true }, client());
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", { nummer: "1K102", adresse: "27" });
  });

  it("create: JSON schema pattern for herkunftsland matches runtime (two letters or empty)", async () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-create-article")!;
    const props = (def.inputSchema as { properties: Record<string, { pattern?: string }> }).properties;
    const re = new RegExp(props.herkunftsland.pattern!);
    expect(re.test("CH")).toBe(true);
    expect(re.test("")).toBe(true);
    expect(re.test("CHE")).toBe(false);
    expect(re.test("C1")).toBe(false);
    await expect(
      handleArticleTool("openxe-create-article", { name_de: "P", nummer: "1", artikelkategorie: "Handelsware", herkunftsland: "CHE" }, client())
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("create: JSON schema carries the category and free-text patterns", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-create-article")!;
    const props = (def.inputSchema as { properties: Record<string, { pattern?: string; allOf?: unknown }> }).properties;
    expect(new RegExp(props.artikelkategorie.pattern!).test("Handelsware")).toBe(true);
    expect(new RegExp(props.artikelkategorie.pattern!).test("Unbekannt")).toBe(false);
    expect(new RegExp(props.hersteller.pattern!).test("L'Oreal")).toBe(false);
    expect(props.artikelkategorie.allOf).toBeUndefined();
  });

  it("buildArticlePayload trims values even when called directly", () => {
    const payload = buildArticlePayload({
      name_de: "  Pinzette  ",
      nummer: " 1K102 ",
      artikelkategorie: "Handelsware",
    } as Parameters<typeof buildArticlePayload>[0]);
    expect(payload.name_de).toBe("Pinzette");
    expect(payload.nummer).toBe("1K102");
  });
});

describe("openxe-update-article JSON schema", () => {
  it("requires at least one field besides nummer via anyOf", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-update-article");
    expect(def).toBeDefined();
    const schema = def!.inputSchema as { required?: string[]; anyOf?: Array<{ required: string[] }> };
    expect(schema.required).toEqual(["nummer"]);
    const alternatives = (schema.anyOf ?? []).map((a) => a.required[0]);
    expect(alternatives).toContain("name_de");
    expect(alternatives).toContain("ean");
    expect(alternatives).not.toContain("nummer");
    expect(JSON.stringify(schema)).not.toContain("allOf");
  });
});

describe("openxe-delete-article-purchase-price", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true, data: { anzahl: "1" } }) };
  });
  const client = () => mockClient as unknown as OpenXEClient;

  it("is registered as a destructive tool with nummer and lieferantennummer required", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-delete-article-purchase-price");
    expect(def).toBeDefined();
    expect(def!.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    const schema = def!.inputSchema as { required?: string[]; properties?: Record<string, unknown>; allOf?: unknown };
    expect(schema.required).toEqual(expect.arrayContaining(["nummer", "lieferantennummer"]));
    expect(schema.properties).toHaveProperty("confirm");
    expect(schema.allOf).toBeUndefined();
  });

  it("dry-run by default and sends nothing", async () => {
    const res = await handleArticleTool(
      "openxe-delete-article-purchase-price",
      { nummer: "1C200", lieferantennummer: "70014" },
      client()
    );
    expect(res.content[0].text).toContain("dry_run");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("with confirm sends the Legacy action with trimmed values", async () => {
    await handleArticleTool(
      "openxe-delete-article-purchase-price",
      { nummer: " 1C200 ", lieferantennummer: " 70014 ", bestellnummer: "B-1", confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEinkaufspreisDelete", {
      nummer: "1C200",
      lieferantennummer: "70014",
      bestellnummer: "B-1",
    });
  });

  it("rejects an empty lieferantennummer before any call", async () => {
    await expect(
      handleArticleTool(
        "openxe-delete-article-purchase-price",
        { nummer: "1C200", lieferantennummer: " ", confirm: true },
        client()
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("rejects an empty bestellnummer instead of widening the delete to all rows of the supplier", async () => {
    await expect(
      handleArticleTool(
        "openxe-delete-article-purchase-price",
        { nummer: "1C200", lieferantennummer: "70014", bestellnummer: " ", confirm: true },
        client()
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });
});

describe("zolltarifnummer (HS code) on article tools", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true }) };
  });
  const client = () => mockClient as unknown as OpenXEClient;

  it("accepts 6 to 10 digits in update and sends it trimmed", async () => {
    await handleArticleTool(
      "openxe-update-article",
      { nummer: "1K102", zolltarifnummer: " 82032000 ", confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "ArtikelEdit",
      expect.objectContaining({ nummer: "1K102", zolltarifnummer: "82032000" })
    );
  });

  it.each(["8203 2000", "8203", "82032000123", "CH-8203", "8203.20"])(
    "rejects %s in update before any call",
    async (value) => {
      await expect(
        handleArticleTool("openxe-update-article", { nummer: "1K102", zolltarifnummer: value, confirm: true }, client())
      ).rejects.toBeInstanceOf(ZodError);
      expect(mockClient.legacyPost).not.toHaveBeenCalled();
    }
  );

  it("the update JSON schema carries the same digit pattern", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-update-article");
    const props = (def!.inputSchema as { properties: Record<string, { pattern?: string }> }).properties;
    const re = new RegExp(props.zolltarifnummer.pattern!);
    expect(re.test("82032000")).toBe(true);
    expect(re.test("8203 2000")).toBe(false);
  });
});

describe("openxe-delete-article", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true }) };
  });
  const client = () => mockClient as unknown as OpenXEClient;

  it("is a destructive tool that requires nummer", () => {
    const def = ARTICLE_TOOL_DEFINITIONS.find((t) => t.name === "openxe-delete-article");
    expect(def).toBeDefined();
    expect(def!.annotations).toMatchObject({ destructiveHint: true });
    expect((def!.inputSchema as { required?: string[] }).required).toEqual(["nummer"]);
  });

  it("dry-run by default and sends nothing", async () => {
    const res = await handleArticleTool("openxe-delete-article", { nummer: "TEST-DEL-1" }, client());
    expect(res.content[0].text).toContain("dry_run");
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("with confirm sends ArtikelEdit with geloescht=1", async () => {
    await handleArticleTool("openxe-delete-article", { nummer: " TEST-DEL-1 ", confirm: true }, client());
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", { nummer: "TEST-DEL-1", geloescht: "1" });
  });

  it("rejects an empty nummer before any call", async () => {
    await expect(
      handleArticleTool("openxe-delete-article", { nummer: "  ", confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });
});

describe("openxe-update-article rename (neue_nummer)", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true }) };
  });
  const client = () => mockClient as unknown as OpenXEClient;

  it("finds the article by old nummer in the URL and writes the new nummer", async () => {
    await handleArticleTool(
      "openxe-update-article",
      { nummer: "1F000P", neue_nummer: " 1F000 ", patched_api_rename: true, confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "ArtikelEdit",
      { nummer: "1F000" },
      { nummer: "1F000P" }
    );
  });

  it("refuses neue_nummer without patched_api_rename, before any call", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1F000P", neue_nummer: "1F000", confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });

  it("refuses a rename to the same number", () => {
    expect(() =>
      ArticleUpdateInput.parse({ nummer: "1F000", neue_nummer: "1F000", patched_api_rename: true })
    ).toThrow();
  });

  it("patched_api_rename alone is not a change", () => {
    expect(() => ArticleUpdateInput.parse({ nummer: "1F000", patched_api_rename: true })).toThrow();
  });

  it("without neue_nummer keeps the plain body and no URL lookup", async () => {
    await handleArticleTool("openxe-update-article", { nummer: "1F000", name_de: "X", confirm: true }, client());
    expect(mockClient.legacyPost).toHaveBeenCalledWith("ArtikelEdit", expect.objectContaining({ nummer: "1F000" }));
  });

  it("neue_nummer alone counts as a field to change", () => {
    expect(() =>
      ArticleUpdateInput.parse({ nummer: "1F000", neue_nummer: "1F001", patched_api_rename: true })
    ).not.toThrow();
  });
});

describe("sales prices (verkaufspreise) carried by article writes", () => {
  let mockClient: { legacyPost: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mockClient = { legacyPost: vi.fn().mockResolvedValue({ success: true }) };
  });
  const client = () => mockClient as unknown as OpenXEClient;

  it("update sends a single sales price as one staffelpreis object in the same call", async () => {
    await handleArticleTool(
      "openxe-update-article",
      { nummer: "1K102", name_de: "Tweezers Classic SA", verkaufspreise: [{ ab_menge: 1, preis: 17.5, waehrung: "chf" }], confirm: true },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "ArtikelEdit",
      expect.objectContaining({
        nummer: "1K102",
        name_de: "Tweezers Classic SA",
        verkaufspreise: { staffelpreis: { ab_menge: "1", preis: "17.5", waehrung: "CHF" } },
      })
    );
  });

  it("update sends several sales prices as a list", async () => {
    await handleArticleTool(
      "openxe-update-article",
      { nummer: "1K102", ean: "7612947004893", verkaufspreise: [{ ab_menge: 1, preis: 17.5, waehrung: "CHF" }, { ab_menge: 5, preis: 16, waehrung: "CHF" }], confirm: true },
      client()
    );
    const payload = mockClient.legacyPost.mock.calls[0][1] as { verkaufspreise: { staffelpreis: unknown[] } };
    expect(payload.verkaufspreise.staffelpreis).toHaveLength(2);
  });

  it("purchase price write keeps sales prices in the same call", async () => {
    await handleArticleTool(
      "openxe-add-article-purchase-price",
      {
        nummer: "1K102",
        einkaufspreis: { preis: 20.35, lieferantennummer: "70000", lieferantname: "Rubis Outils SA", bestellnummer: "1K102", bezeichnunglieferant: "Tweezers Classic SA", waehrung: "CHF" },
        verkaufspreise: [{ ab_menge: 1, preis: 17.5, waehrung: "CHF" }],
        confirm: true,
      },
      client()
    );
    expect(mockClient.legacyPost).toHaveBeenCalledWith(
      "ArtikelEdit",
      expect.objectContaining({ verkaufspreise: { staffelpreis: { ab_menge: "1", preis: "17.5", waehrung: "CHF" } } })
    );
  });

  it("rejects a sales price with a bad currency or negative price before any call", async () => {
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", verkaufspreise: [{ ab_menge: 1, preis: -1, waehrung: "CHF" }], confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      handleArticleTool("openxe-update-article", { nummer: "1K102", verkaufspreise: [{ ab_menge: 1, preis: 1, waehrung: "CHFX" }], confirm: true }, client())
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockClient.legacyPost).not.toHaveBeenCalled();
  });
});
