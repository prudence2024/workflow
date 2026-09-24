import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

// ── Payment Transactions ──
export interface PaymentTransaction {
  id: string;
  order_id: string | null;
  reference: string;
  paystack_reference: string | null;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export async function getTransactions(options?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("payment_transactions")
    .select("*, orders(reference, email)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);
  if (options?.search)
    query = query.or(
      `reference.ilike.%${options.search}%,paystack_reference.ilike.%${options.search}%`,
    );
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch transactions: ${error.message}`);
  return { transactions: (data || []) as any[], total: count || 0 };
}

export async function getTransactionById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("payment_transactions")
    .select("*, orders(reference, email, customers(first_name, last_name))")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Transaction not found: ${error.message}`);
  return data as any;
}

export async function createTransaction(input: {
  order_id?: string;
  reference: string;
  paystack_reference?: string;
  amount: number;
  currency?: string;
  status?: string;
  channel?: string;
  metadata?: any;
}) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("payment_transactions")
    .insert({ ...input, currency: input.currency || "NGN", status: input.status || "initiated" })
    .select()
    .single();
  if (error) throw new Error(`Failed to create transaction: ${error.message}`);
  return data as PaymentTransaction;
}

export async function updateTransaction(id: string, input: Partial<PaymentTransaction>) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("payment_transactions")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update transaction: ${error.message}`);
  return data as PaymentTransaction;
}

export async function getTransactionByReference(reference: string) {
  const db = createDatabaseClient();
  const { data } = await db
    .from("payment_transactions")
    .select("*")
    .eq("reference", reference)
    .single();
  return data as PaymentTransaction | null;
}

// ── Receipts ──
export interface Receipt {
  id: string;
  order_id: string | null;
  transaction_id: string | null;
  receipt_number: string;
  customer_email: string;
  items_snapshot: any;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  currency: string;
  status: string;
  sent_email_at: string | null;
  sent_whatsapp_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export async function getReceipts(options?: { search?: string; limit?: number; offset?: number }) {
  const db = createDatabaseClient();
  let query = db
    .from("receipts")
    .select("*, orders(reference)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.search)
    query = query.or(
      `receipt_number.ilike.%${options.search}%,customer_email.ilike.%${options.search}%`,
    );
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch receipts: ${error.message}`);
  return { receipts: (data || []) as any[], total: count || 0 };
}

export async function generateReceiptNumber(): Promise<string> {
  const db = createDatabaseClient();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `DG-${today}-`;
  // Get the latest receipt number for today
  const { data } = await db
    .from("receipts")
    .select("receipt_number")
    .like("receipt_number", `${prefix}%`)
    .order("receipt_number", { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    const last = data[0].receipt_number;
    const num = parseInt(last.replace(prefix, ""), 10) + 1;
    return `${prefix}${String(num).padStart(6, "0")}`;
  }
  return `${prefix}000001`;
}

export async function createReceipt(input: {
  order_id?: string;
  transaction_id?: string;
  customer_email: string;
  items_snapshot: any;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  currency?: string;
}) {
  const db = createDatabaseClient();
  const receipt_number = await generateReceiptNumber();
  const { data, error } = await db
    .from("receipts")
    .insert({ ...input, receipt_number, currency: input.currency || "NGN" })
    .select()
    .single();
  if (error) throw new Error(`Failed to create receipt: ${error.message}`);
  return data as Receipt;
}

export async function updateReceipt(id: string, input: Partial<Receipt>) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("receipts").update(input).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update receipt: ${error.message}`);
  return data as Receipt;
}

// ── Communication Logs ──
export async function logCommunication(input: {
  type: string;
  recipient: string;
  subject?: string;
  body_preview?: string;
  provider: string;
  status?: string;
  provider_message_id?: string;
  error_message?: string;
}) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("communication_logs")
    .insert({ ...input, status: input.status || "pending" })
    .select()
    .single();
  if (error) console.error("Failed to log communication:", error.message);
  return data;
}

export async function getCommunicationLogs(options?: {
  type?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("communication_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.type) query = query.eq("type", options.type);
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch communication logs: ${error.message}`);
  return { logs: (data || []) as any[], total: count || 0 };
}
