import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenXEClient } from "../../src/client/openxe-client.js";
import {
  handleShopTool,
  SHOP_TOOL_DEFINITIONS,
} from "../../src/tools/shop-tools.js";

describe("Shop Tools", () => {
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
  });

  it("defines all 10 shop tools", () => {
    const names = SHOP_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual([
      "openxe-shop-status",
      "openxe-shop-auth",
      "openxe-shop-sync-stock",
      "openxe-shop-import-article",
      "openxe-shop-push-article",
      "openxe-shop-import-order",
      "openxe-shop-statistics",
      "openxe-shop-disconnect",
      "openxe-shop-reconnect",
      "openxe-shop-refund",
    ]);
  });

  it("gets shop status via GET", async () => {
    mockClient.get.mockResolvedValue({ data: { connected: true, shop: "WooCommerce" } });

    const result = await handleShopTool(
      "openxe-shop-status",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/shopimport/status");
    expect(result.content[0].text).toContain("connected");
  });

  it("authenticates shop via POST", async () => {
    mockClient.post.mockResolvedValue({ data: { success: true } });

    const result = await handleShopTool(
      "openxe-shop-auth",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/shopimport/auth", {});
    expect(result.content[0].text).toContain("success");
  });

  it("syncs stock with base64-encoded article number", async () => {
    mockClient.post.mockResolvedValue({ data: { synced: true } });

    const result = await handleShopTool(
      "openxe-shop-sync-stock",
      { articlenumber: "ART-001" },
      mockClient as unknown as OpenXEClient
    );

    const expectedB64 = Buffer.from("ART-001").toString("base64");
    expect(mockClient.post).toHaveBeenCalledWith(
      `/shopimport/syncstorage/${expectedB64}`,
      {}
    );
    expect(result.content[0].text).toContain("synced");
  });

  it("imports article from shop with base64-encoded article number", async () => {
    mockClient.post.mockResolvedValue({ data: { imported: true } });

    await handleShopTool(
      "openxe-shop-import-article",
      { articlenumber: "SKU-123" },
      mockClient as unknown as OpenXEClient
    );

    const expectedB64 = Buffer.from("SKU-123").toString("base64");
    expect(mockClient.post).toHaveBeenCalledWith(
      `/shopimport/articletoxentral/${expectedB64}`,
      {}
    );
  });

  it("pushes article to shop with base64-encoded article number", async () => {
    mockClient.post.mockResolvedValue({ data: { pushed: true } });

    await handleShopTool(
      "openxe-shop-push-article",
      { articlenumber: "SKU-456" },
      mockClient as unknown as OpenXEClient
    );

    const expectedB64 = Buffer.from("SKU-456").toString("base64");
    expect(mockClient.post).toHaveBeenCalledWith(
      `/shopimport/articletoshop/${expectedB64}`,
      {}
    );
  });

  it("imports order from shop with base64-encoded order number", async () => {
    mockClient.post.mockResolvedValue({ data: { order_id: 99 } });

    await handleShopTool(
      "openxe-shop-import-order",
      { ordernumber: "ORD-2024-001" },
      mockClient as unknown as OpenXEClient
    );

    const expectedB64 = Buffer.from("ORD-2024-001").toString("base64");
    expect(mockClient.post).toHaveBeenCalledWith(
      `/shopimport/ordertoxentral/${expectedB64}`,
      {}
    );
  });

  it("gets shop statistics via GET", async () => {
    mockClient.get.mockResolvedValue({
      data: { open_orders: 5, income: 1234.56 },
    });

    const result = await handleShopTool(
      "openxe-shop-statistics",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.get).toHaveBeenCalledWith("/shopimport/statistics");
    expect(result.content[0].text).toContain("open_orders");
  });

  it("disconnects shop via POST", async () => {
    mockClient.post.mockResolvedValue({ data: { aktiv: 0 } });

    await handleShopTool(
      "openxe-shop-disconnect",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/shopimport/disconnect", {});
  });

  it("reconnects shop via POST", async () => {
    mockClient.post.mockResolvedValue({ data: { aktiv: 1 } });

    await handleShopTool(
      "openxe-shop-reconnect",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/shopimport/reconnect", {});
  });

  it("processes refund via POST", async () => {
    mockClient.post.mockResolvedValue({ data: { refunded: true } });

    const result = await handleShopTool(
      "openxe-shop-refund",
      { order_id: "123", amount: 29.99, reason: "Defective" },
      mockClient as unknown as OpenXEClient
    );

    expect(mockClient.post).toHaveBeenCalledWith("/shopimport/refund", {
      order_id: "123",
      amount: 29.99,
      reason: "Defective",
    });
    expect(result.content[0].text).toContain("refunded");
  });

  it("returns error for unknown tool name", async () => {
    const result = await handleShopTool(
      "openxe-shop-nonexistent",
      {},
      mockClient as unknown as OpenXEClient
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });
});
