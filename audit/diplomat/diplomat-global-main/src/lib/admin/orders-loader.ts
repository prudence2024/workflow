import { z } from "zod";

export const ordersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  search: z.string().optional().default(""),
  status: z.string().optional().default("all"),
  detail: z.string().optional().default(""),
});

export function ordersLoaderDeps({ search }: { search: z.infer<typeof ordersSearchSchema> }) {
  return { page: search.page, search: search.search, status: search.status };
}

export async function loadOrdersPage({ deps }: { deps: ReturnType<typeof ordersLoaderDeps> }) {
  try {
    const { adminListOrders } = await import("./server-fns");
    const result = await adminListOrders({ data: { ...deps, pageSize: 10 } });
    if (result.error) throw new Error("Orders unavailable");
    return { orders: result.orders ?? [], total: result.total ?? 0 };
  } catch {
    throw new Error("Unable to load orders. Please retry.");
  }
}
