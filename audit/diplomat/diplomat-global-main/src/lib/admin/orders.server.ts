import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

export interface Order {
  id: string;
  reference: string;
  customer_id: string | null;
  email: string;
  status: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  currency: string;
  coupon_id: string | null;
  payment_reference: string | null;
  shipping_address: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  customers?: { first_name: string; last_name: string; email: string; phone: string } | null;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export async function getOrders(options?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("orders")
    .select("*, customers(first_name, last_name, email, phone), order_items(*)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options?.status) query = query.eq("status", options.status);
  if (options?.search) {
    query = query.or(`reference.ilike.%${options.search}%,email.ilike.%${options.search}%`);
  }
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
  return { orders: (data || []) as any[], total: count || 0 };
}

export async function getOrderById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("orders")
    .select("*, customers(first_name, last_name, email, phone), order_items(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Order not found: ${error.message}`);
  return data as any;
}

export async function updateOrderStatus(id: string, status: string) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("orders").update({ status }).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update order: ${error.message}`);
  return data as Order;
}

export async function getOrderCount(status?: string) {
  const db = createDatabaseClient();
  let query = db.from("orders").select("id", { count: "exact", head: true });
  if (status) query = query.eq("status", status);
  const { count } = await query;
  return count || 0;
}

export async function getTotalRevenue() {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("orders")
    .select("total")
    .in("status", ["paid", "processing", "shipped", "delivered"]);
  if (error) return 0;
  return (data || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);
}
