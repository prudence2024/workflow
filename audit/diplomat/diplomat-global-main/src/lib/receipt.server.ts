import { loadBusinessSettings } from "./business-settings.server";
import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "@/lib/database.server";
import {
  buildReceiptDocument,
  generateReceiptHTML,
  type ReceiptDocumentData,
  type ReceiptRecordInput,
} from "@/lib/receipt-document";

const RECEIPT_SELECT = `
  receipt_number,
  customer_email,
  items_snapshot,
  subtotal,
  discount,
  delivery_fee,
  total,
  currency,
  created_at,
  download_token,
  orders(reference, status, email, shipping_address, payment_reference),
  payment_transactions(reference, paystack_reference, status, channel, paid_at)
`;

type DatabaseClient = ReturnType<typeof createDatabaseClient>;
type ReceiptQueryRecord = ReceiptRecordInput["receipt"] & {
  orders: ReceiptRecordInput["order"] | ReceiptRecordInput["order"][] | null;
  payment_transactions:
    ReceiptRecordInput["transaction"] | ReceiptRecordInput["transaction"][] | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function buildFromRecord(
  db: DatabaseClient,
  receipt: ReceiptQueryRecord,
): Promise<ReceiptDocumentData | null> {
  const order = relatedOne(receipt.orders);
  const transaction = relatedOne(receipt.payment_transactions);
  if (!order || !transaction) return null;
  const settings = await loadBusinessSettings(db);
  try {
    return buildReceiptDocument({ receipt, order, transaction, settings });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unfinalized payment")) return null;
    throw error;
  }
}

export async function loadReceiptDocumentByToken(
  token: string,
): Promise<ReceiptDocumentData | null> {
  const db = createDatabaseClient();
  const result = await db
    .from("receipts")
    .select(RECEIPT_SELECT)
    .eq("download_token", token)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error("Receipt could not be loaded");
  if (!result.data) return null;
  return buildFromRecord(db, result.data as unknown as ReceiptQueryRecord);
}

export async function loadReceiptDocumentById(id: string): Promise<ReceiptDocumentData | null> {
  const db = createDatabaseClient();
  const result = await db
    .from("receipts")
    .select(RECEIPT_SELECT)
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error("Receipt could not be loaded");
  if (!result.data) return null;
  return buildFromRecord(db, result.data as unknown as ReceiptQueryRecord);
}

export { generateReceiptHTML };
export type { ReceiptDocumentData };
