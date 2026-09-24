import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
const state = vi.hoisted(() => ({
  db: null as unknown,
  active: true,
  userId: "user-owner",
  name: "Prudence",
  auditFail: false,
  events: [] as string[],
  lowStock: vi.fn(),
  telegram: vi.fn(),
  destroy: vi.fn(),
  resource: vi.fn(),
}));
vi.mock("../src/lib/database.server", () => ({
  createDatabaseClient: () => state.db,
  getDatabaseConfig: () => ({}),
}));
vi.mock("../src/lib/admin/admin-ops.server", () => ({
  createDatabaseClient: () => state.db,
  requirePermission: async () => (state.active ? null : "Not authorized"),
  logAudit: async () => {},
}));
vi.mock("../src/lib/cache.server", () => ({ invalidateCache: vi.fn() }));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: async () => ({ userId: state.userId, isAuthenticated: !!state.userId }),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { getUser: async () => ({ firstName: state.name, lastName: "" }) },
  }),
}));
vi.mock("../src/lib/notifications", () => ({
  notifications: { lowStock: (...args: unknown[]) => state.lowStock(...args) },
}));
vi.mock("../src/lib/telegram.server", () => ({
  sendAdminAlert: (...args: unknown[]) => state.telegram(...args),
}));
vi.mock("../src/lib/cloudinary.server", () => ({
  getCloudinaryConfig: () => ({ cloudName: "fixture", apiKey: "fixture", apiSecret: "fixture" }),
}));
vi.mock("cloudinary", () => ({
  v2: {
    config: () => {},
    api: {
      resource: (...args: unknown[]) => state.resource(...args),
      delete_resources: (...args: unknown[]) => state.destroy(...args),
    },
  },
}));
import { createProduct, updateProduct, deleteProduct } from "../src/lib/products-admin.server";
import { resolveInventoryState } from "../src/lib/inventory-lifecycle";
import { emitLowStockTransition } from "../src/lib/inventory-settings.server";
import { findUnsharedProductAssets } from "../src/lib/product-media-cleanup.server";
import { updateSiteSettings } from "../src/lib/admin/server-fns";
import { loadInventorySettings } from "../src/lib/inventory-settings.server";

const id = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let scanFail: string;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", "fixture");
  state.active = true;
  state.userId = "user-owner";
  state.name = "Prudence";
  state.auditFail = false;
  state.events = [];
  scanFail = "";
  state.lowStock.mockReset();
  state.telegram.mockReset();
  state.destroy.mockReset();
  state.resource.mockReset();
  rows = {
    products: [],
    inventory: [],
    product_images: [],
    audit_logs: [],
    blog_posts: [],
    hero_slides: [],
    site_pages: [],
    site_settings: [
      { key: "low_stock_threshold_default", value: "5" },
      { key: "low_stock_alerts_enabled", value: "false" },
    ],
  };
  // Real PostgREST serialization against an intercepted, isolated database boundary.
  // No transaction/locking semantics are simulated here.
  state.db = new PostgrestClient("https://fixture.invalid/rest/v1", {
    retry: false,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      const method = init?.method ?? "GET";
      state.events.push(`${method}:${table}`);
      if (table === "admin_users")
        return json({
          id: "admin-owner",
          active: state.active,
          role_id: "owner-role",
          roles: { key: "owner" },
          email: "wrong-prefix@example.com",
        });
      if (table === "roles") return json({ key: "owner" });
      if (table === scanFail) return json({ message: "fixture scan failure" }, 400);
      if (table === "audit_logs" && state.auditFail)
        return json({ message: "fixture audit failure" }, 400);
      if (!(table in rows)) throw new Error(`Unexpected table ${table}`);
      const matches = (row: Row) =>
        [...url.searchParams].every(
          ([key, value]) => !value.startsWith("eq.") || String(row[key]) === value.slice(3),
        );
      let selected = rows[table].filter(matches);
      if (method === "POST") {
        const body = JSON.parse(String(init?.body));
        selected = (Array.isArray(body) ? body : [body]).map((row) => ({ id, ...row }));
        if (table === "inventory") rows[table] = [];
        rows[table].push(...selected);
      } else if (method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        selected.forEach((row) => Object.assign(row, body));
      } else if (method === "DELETE") {
        rows[table] = rows[table].filter((row) => !matches(row));
        if (table === "products")
          rows.product_images = rows.product_images.filter((row) => row.product_id !== id);
      }
      const single = new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object");
      return json(single ? (selected[0] ?? null) : selected);
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected external network call");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const create = (extra: Row = {}) =>
  createProduct({
    name: "Monitor",
    slug: "monitor",
    sku: "DG-MON-SN10",
    price: 85000,
    status: "active",
    quantity: 10,
    ...extra,
  });
const inventory = () => rows.inventory[0];
describe("real Product handler inventory corrections", () => {
  it("persists one stock authority across the full edit lifecycle and audits actual old values", async () => {
    expect(await create({ low_stock_threshold: 3 })).toMatchObject({ ok: true });
    expect(inventory()).toMatchObject({ quantity: 10, low_stock_threshold: 3 });
    for (const [quantity, expected] of [
      [25, "in_stock"],
      [3, "low_stock"],
      [0, "out_of_stock"],
      [8, "in_stock"],
    ] as const) {
      const before = inventory().quantity;
      expect(await updateProduct({ product_id: id, quantity })).toMatchObject({ ok: true });
      expect(resolveInventoryState(inventory(), false).state).toBe(expected);
      expect(rows.audit_logs.at(-1)?.metadata.changes.quantity).toEqual({
        before,
        after: quantity,
      });
    }
    expect(rows.products[0]).not.toHaveProperty("quantity");
  });
  it.each([
    [undefined, 5, "low_stock"],
    [2, 2, "in_stock"],
    [0, 0, "in_stock"],
  ])("resolves threshold %s without truthiness", async (threshold, stored, expected) => {
    await create({ quantity: 4, low_stock_threshold: threshold });
    expect(inventory().low_stock_threshold).toBe(stored);
    expect(resolveInventoryState(inventory(), false).state).toBe(expected);
    await updateProduct({ product_id: id, price: 90000 });
    expect(inventory().low_stock_threshold).toBe(stored);
  });
  it("uses authenticated display name, never browser identity or email prefix", async () => {
    await create({ actor_name: "Forged" });
    expect(rows.audit_logs[0].metadata).toMatchObject({
      actor_name: "Prudence",
      actor_user_id: "user-owner",
      actor_admin_id: "admin-owner",
      actor_role: "owner",
      action: "PRODUCT_CREATED",
    });
  });
  it("labels absent profile names honestly", async () => {
    state.name = "";
    await create();
    expect(rows.audit_logs[0].metadata.actor_name).toBe("Name not provided");
  });
  it.each(["create", "edit", "delete"])("awaits required %s audit failure", async (action) => {
    if (action !== "create") await create();
    state.auditFail = true;
    await expect(
      action === "create"
        ? create()
        : action === "edit"
          ? updateProduct({ product_id: id, price: 90000 })
          : deleteProduct({ product_id: id }),
    ).rejects.toThrow("Product audit could not be persisted");
    if (action === "delete") expect(rows.products).toHaveLength(1);
  });
  it("persists deletion context before deleting and preserves the audit afterward", async () => {
    await create();
    state.events = [];
    expect(await deleteProduct({ product_id: id })).toMatchObject({ ok: true });
    expect(state.events.indexOf("POST:audit_logs")).toBeLessThan(
      state.events.indexOf("DELETE:products"),
    );
    expect(rows.products).toHaveLength(0);
    expect(rows.audit_logs.at(-1).metadata).toMatchObject({
      action: "PRODUCT_DELETED",
      status: "success",
      product_name: "Monitor",
      actor_name: "Prudence",
    });
  });
  it("rejects unauthorized mutations with zero writes", async () => {
    state.active = false;
    expect(await create()).toMatchObject({ ok: false });
    expect(await updateProduct({ product_id: id, quantity: 1 })).toMatchObject({ ok: false });
    expect(await deleteProduct({ product_id: id })).toMatchObject({ ok: false });
    expect(state.events.every((event) => event.startsWith("GET:"))).toBe(true);
  });
  it.each([-1, 1.5, 1000001])("rejects invalid stock %s before writing", async (quantity) => {
    await expect(create({ quantity })).rejects.toThrow();
    expect(state.events).toHaveLength(0);
  });
});
describe("low-stock transition side effects", () => {
  it("saves and reloads inventory Settings through the real handler", async () => {
    expect(
      await updateSiteSettings({
        settings: { low_stock_threshold_default: "0", low_stock_alerts_enabled: "false" },
      }),
    ).toEqual({ ok: true });
    expect(await loadInventorySettings(state.db as never)).toEqual({
      defaultThreshold: 0,
      alertsEnabled: false,
    });
  });
  it.each(["", "-1", "1.5", "1000001"])("rejects invalid Settings threshold %s", async (value) => {
    expect(
      await updateSiteSettings({ settings: { low_stock_threshold_default: value } }),
    ).toMatchObject({ ok: false });
    expect(state.events).toHaveLength(0);
  });
  it("rejects ambiguous alert settings", async () => {
    expect(
      await updateSiteSettings({ settings: { low_stock_alerts_enabled: "yes" } }),
    ).toMatchObject({ ok: false });
  });
  const product = { id, name: "Monitor" };
  it("suppresses both channels when disabled without changing stock semantics", async () => {
    await emitLowStockTransition(
      state.db as never,
      product,
      { quantity: 4, low_stock_threshold: 3 },
      { quantity: 3, low_stock_threshold: 3 },
    );
    expect(state.lowStock).not.toHaveBeenCalled();
    expect(state.telegram).not.toHaveBeenCalled();
    expect(resolveInventoryState({ quantity: 3, low_stock_threshold: 3 }, true).state).toBe(
      "low_stock",
    );
  });
  it("alerts on entry into low stock, not repeated low-stock edits", async () => {
    rows.site_settings[1].value = "true";
    await emitLowStockTransition(
      state.db as never,
      product,
      { quantity: 4, low_stock_threshold: 3 },
      { quantity: 3, low_stock_threshold: 3 },
    );
    await emitLowStockTransition(
      state.db as never,
      product,
      { quantity: 3, low_stock_threshold: 3 },
      { quantity: 2, low_stock_threshold: 3 },
    );
    expect(state.lowStock).toHaveBeenCalledTimes(1);
    expect(state.telegram).toHaveBeenCalledTimes(1);
  });
});
describe("shared Cloudinary reference guard", () => {
  const publicId = "diplomat-global/products/fixture";
  const image = {
    cloudinary_public_id: publicId,
    secure_url: `https://res.cloudinary.com/fixture/image/upload/v1/${publicId}.jpg`,
  };
  it.each([
    "product_images",
    "blog_posts",
    "hero_slides",
    "site_pages",
    "site_settings",
    "products",
  ])("retains assets referenced in %s", async (table) => {
    rows[table].push({
      id: "other",
      content: `<img src="${image.secure_url}">`,
      image: image.secure_url,
      value: image.secure_url,
      cloudinary_public_id: publicId,
    });
    expect(await findUnsharedProductAssets(state.db as never, [image], "fixture")).toMatchObject({
      safe: [],
      retained: [publicId],
    });
  });
  it("permits an owned unshared image after complete scans", async () => {
    expect(await findUnsharedProductAssets(state.db as never, [image], "fixture")).toMatchObject({
      safe: [publicId],
      scanFailed: false,
    });
  });
  it("retains everything when a scan fails", async () => {
    scanFail = "site_pages";
    expect(await findUnsharedProductAssets(state.db as never, [image], "fixture")).toMatchObject({
      safe: [],
      scanFailed: true,
    });
  });
  it("rejects another cloud or an unproven URL", async () => {
    expect(
      (await findUnsharedProductAssets(state.db as never, [image], "different-cloud")).safe,
    ).toEqual([]);
  });
  it.each([false, true])(
    "deletes owned media through the real delete handler (provider failure=%s)",
    async (fail) => {
      await create();
      rows.products[0].product_images = [image];
      rows.product_images = [{ ...image, id: "image", product_id: id }];
      state.resource.mockResolvedValue({
        public_id: publicId,
        secure_url: image.secure_url,
        resource_type: "image",
        format: "jpg",
        bytes: 1000,
        width: 100,
        height: 100,
      });
      if (fail) state.destroy.mockRejectedValue(new Error("fixture provider outage"));
      else state.destroy.mockResolvedValue({ deleted: { [publicId]: "deleted" } });
      expect(await deleteProduct({ product_id: id })).toMatchObject({
        ok: true,
        cleanup_failed: fail,
      });
      expect(state.destroy).toHaveBeenCalledWith([publicId]);
      expect(rows.products).toHaveLength(0);
      if (fail)
        expect(rows.audit_logs.at(-1).metadata).toMatchObject({
          status: "retryable",
          failed_public_ids: [publicId],
        });
    },
  );
  it("never contacts Cloudinary for a shared deleted-product asset", async () => {
    await create();
    rows.products[0].product_images = [image];
    rows.blog_posts.push({ id: "blog", image: image.secure_url });
    expect(await deleteProduct({ product_id: id })).toMatchObject({
      ok: true,
      cleanup_failed: false,
    });
    expect(state.destroy).not.toHaveBeenCalled();
    expect(state.resource).not.toHaveBeenCalled();
    expect(rows.audit_logs.at(-1).metadata.status).toBe("retained");
  });
});
