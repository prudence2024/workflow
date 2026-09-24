import { createServerOnlyFn } from "@tanstack/react-start";

type OrdersInput = { search?: string; status?: string; page?: number; pageSize?: number };

export const readOrdersPage = createServerOnlyFn(async ({ data }: { data?: OrdersInput }) => {
  const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("orders.view");
  if (authError)
    return {
      orders: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      error: authError,
    };
  const db = createDatabaseClient();
  const page = data?.page || 1;
  const pageSize = data?.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = db
    .from("orders")
    .select("*, customers(first_name, last_name, email, phone), order_items(*)", {
      count: "exact",
    })
    .order("created_at", { ascending: false });
  if (data?.status && data.status !== "all") query = query.eq("status", data.status);
  if (data?.search) {
    query = query.or(`reference.ilike.%${data.search}%,email.ilike.%${data.search}%`);
  }
  const { data: orders, count, error } = await query.range(from, to);
  if (error) throw new Error("Unable to load orders. Please retry.");
  const total = count ?? 0;
  return { orders: orders ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
});
