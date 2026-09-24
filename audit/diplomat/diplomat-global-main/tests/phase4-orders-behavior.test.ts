import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

const fixture = vi.hoisted(() => ({ reads: 0, value: "A", fail: false, allowed: true }));
vi.mock("../src/lib/admin/server-fns", async () => {
  const { readOrdersPage } = await import("../src/lib/admin/orders-query.server");
  return { adminListOrders: readOrdersPage };
});
vi.mock("../src/lib/admin/admin-ops.server", () => ({
  requirePermission: async () => (fixture.allowed ? null : "Not authorized"),
  createDatabaseClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        or: () => query,
        range: async () => {
          fixture.reads++;
          return {
            data: [{ id: "order-1", reference: fixture.value }],
            count: 1,
            error: fixture.fail ? { message: "private database failure" } : null,
          };
        },
      };
      return query;
    },
  }),
}));
import {
  loadOrdersPage,
  ordersLoaderDeps,
  ordersSearchSchema,
} from "../src/lib/admin/orders-loader";
import { readOrdersPage } from "../src/lib/admin/orders-query.server";

beforeEach(() => Object.assign(fixture, { reads: 0, value: "A", fail: false, allowed: true }));

describe("Orders route and actual server handler reads", () => {
  it("executes the server query against the controlled database", async () => {
    expect(await readOrdersPage({ data: { page: 1 } })).toMatchObject({
      orders: [{ reference: "A" }],
    });
  });
  it("initial, filter, page and Refresh each read once; Refresh replaces A with B", async () => {
    const root = createRootRoute();
    const orders = createRoute({
      getParentRoute: () => root,
      path: "/dashboard/orders",
      validateSearch: ordersSearchSchema,
      loaderDeps: ordersLoaderDeps,
      loader: loadOrdersPage,
    });
    const router = createRouter({
      routeTree: root.addChildren([orders]),
      history: createMemoryHistory({ initialEntries: ["/dashboard/orders"] }),
      isServer: true,
    });
    // Follow the same validated-search canonical URL used by SSR redirects.
    router.history.replace(
      router.buildLocation({
        to: "/dashboard/orders",
        search: {
          page: 1,
          search: "",
          status: "all",
          detail: "",
        },
      }).href,
    );
    await router.load();
    expect(router.state.matches.map((match) => match.error).filter(Boolean)).toEqual([]);
    expect(fixture.reads).toBe(1);
    expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ orders: [{ reference: "A" }] });
    await router.navigate({
      to: "/dashboard/orders",
      search: { page: 1, status: "paid", search: "", detail: "" },
    });
    expect(fixture.reads).toBe(2);
    await router.navigate({
      to: "/dashboard/orders",
      search: { page: 2, status: "paid", search: "", detail: "" },
    });
    expect(fixture.reads).toBe(3);
    fixture.value = "B";
    await router.invalidate({ sync: true });
    expect(fixture.reads).toBe(4);
    expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ orders: [{ reference: "B" }] });
  });

  it("orders failures are safe errors, not an empty successful page", async () => {
    fixture.fail = true;
    await expect(loadOrdersPage({ deps: { page: 1, search: "", status: "all" } })).rejects.toThrow(
      "Unable to load orders. Please retry.",
    );
  });
  it("permission denial performs zero DB reads", async () => {
    fixture.allowed = false;
    await expect(
      loadOrdersPage({ deps: { page: 1, search: "", status: "all" } }),
    ).rejects.toThrow();
    expect(fixture.reads).toBe(0);
  });
  it("detail does not enter list query dependencies", () => {
    expect(ordersLoaderDeps({ search: ordersSearchSchema.parse({ detail: "order-1" }) })).toEqual({
      page: 1,
      search: "",
      status: "all",
    });
  });
});
