import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

/**
 * Normalize Nigerian phone numbers to canonical +234XXXXXXXXXX format.
 * Handles: 08012345678, 8012345678, +2348012345678
 * Returns null if input is empty/null/invalid.
 */
function normalizeNigerianPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return null;
  // Already has +234 prefix
  if (digits.startsWith("234") && digits.length >= 13) {
    return `+${digits}`;
  }
  // Starts with 0 — local format, strip leading 0 and add +234
  if (digits.startsWith("0") && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  // 10-digit number without leading 0
  if (digits.length === 10) {
    return `+234${digits}`;
  }
  // Return as-is if can't normalize (validation should catch bad numbers)
  return `+${digits}`;
}

export interface Customer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  state: string | null;
  lga: string | null;
  city: string | null;
  address: string | null;
  marketing_consent: boolean;
  created_at: string;
  updated_at: string;
}

export async function getCustomers(options?: { search?: string; limit?: number; offset?: number }) {
  const db = createDatabaseClient();
  let query = db
    .from("customers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.search)
    query = query.or(
      `first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%,email.ilike.%${options.search}%`,
    );
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch customers: ${error.message}`);
  return { customers: (data || []) as Customer[], total: count || 0 };
}

export async function getCustomerById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("customers").select("*").eq("id", id).single();
  if (error) throw new Error(`Customer not found: ${error.message}`);
  return data as Customer;
}

export async function getCustomerOrderCount(customerId: string) {
  const db = createDatabaseClient();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  return count || 0;
}

export async function getCustomerTotalSpend(customerId: string) {
  const db = createDatabaseClient();
  const { data } = await db
    .from("orders")
    .select("total")
    .eq("customer_id", customerId)
    .in("status", ["paid", "processing", "shipped", "delivered"]);
  return (data || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);
}

export async function getCustomerCount() {
  const db = createDatabaseClient();
  const { count } = await db.from("customers").select("id", { count: "exact", head: true });
  return count || 0;
}

export async function upsertCustomer(input: {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  state?: string;
  lga?: string;
  city?: string;
  address?: string;
}) {
  const db = createDatabaseClient();
  const normalizedPhone = normalizeNigerianPhone(input.phone);
  const { data, error } = await db
    .from("customers")
    .upsert(
      {
        ...input,
        phone: normalizedPhone,
        first_name: input.first_name || "",
        last_name: input.last_name || "",
      },
      { onConflict: "email" },
    )
    .select()
    .single();
  if (error) throw new Error(`Failed to upsert customer: ${error.message}`);
  return data as Customer;
}
