/**
 * Provider-authoritative Paystack refund lifecycle handling.
 *
 * Semantics (per owner requirement):
 *  - refund.pending         → Refund pending (provider acknowledged request)
 *  - refund.processing      → Refund processing
 *  - refund.processed       → Refund completed (transaction/order → refunded)
 *  - refund.failed          → Refund failed — ORIGINAL PAYMENT REMAINS SUCCESSFUL
 *  - refund.needs-attention → manual follow-up required; payment unchanged
 *
 * Truthfulness rules:
 *  - The provider webhook state is the ONLY authority for refund status.
 *    A 200 from the Create-Refund API is an acknowledgement, not completion.
 *  - refund.failed must restore the transaction to `successful` (the customer
 *    was charged; money did not leave). The original paid state is preserved.
 *  - Events are idempotent: replaying the same event never double-mutates.
 *  - Out-of-order tolerance: a non-terminal status never overwrites a
 *    terminal one (processed/failed are terminal for a given refund id).
 *  - No receipt/document rows are created here; documents are rendered from
 *    transaction state (receipts stay = successful financial receipts only).
 *
 * Storage: rides payment_transactions.metadata.refund (no migration needed);
 * payment_transactions.status CHECK already allows `refunded`.
 */
import type { createDatabaseClient } from "./database.server";

type Database = ReturnType<typeof createDatabaseClient>;

const TERMINAL_REFUND_STATES = new Set(["processed", "failed"]);

export type RefundEventStatus =
  "pending" | "processing" | "processed" | "failed" | "needs-attention";

/** Map provider event → application refund status. Unknown events rejected. */
export function refundStatusFromEvent(eventType: string): RefundEventStatus | null {
  switch (eventType) {
    case "refund.pending":
      return "pending";
    case "refund.processing":
      return "processing";
    case "refund.processed":
      return "processed";
    case "refund.failed":
      return "failed";
    case "refund.needs-attention":
      return "needs-attention";
    default:
      return null;
  }
}

/** Rank non-terminal progression; used to ignore regressions/out-of-order events. */
const STATUS_RANK: Record<RefundEventStatus, number> = {
  pending: 1,
  processing: 2,
  "needs-attention": 2,
  processed: 3,
  failed: 3,
};

interface RefundMetadata {
  refund?: {
    status: RefundEventStatus;
    refund_id?: number | string;
    amount?: number;
    currency?: string;
    processed_at?: string;
    updated_at: string;
    note?: string;
    history?: Array<{ status: RefundEventStatus; at: string }>;
  };
}

interface RefundEventPayload {
  id?: number | string;
  refund_id?: number | string;
  transaction_reference?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  note?: string;
  status?: string;
}

export async function applyRefundLifecycleEvent(
  eventType: string,
  payload: RefundEventPayload,
): Promise<{ ok: boolean; message: string }> {
  const status = refundStatusFromEvent(eventType);
  if (!status) {
    return { ok: false, message: `Unknown refund event: ${eventType}` };
  }
  const refundId = payload?.id ?? payload?.refund_id;
  const transactionReference: string | undefined =
    payload?.transaction_reference ?? payload?.reference;
  if (!transactionReference) {
    return { ok: false, message: "Missing refund transaction reference" };
  }
  if (refundId == null && !payload?.amount) {
    return { ok: false, message: "Refund payload missing id and amount" };
  }

  const db: Database = (await import("./database.server")).createDatabaseClient();

  // Resolve the payment attempt. Refund webhooks carry the provider
  // transaction reference (Paystack `transaction_reference`), which our app
  // stores on payment_transactions.paystack_reference.
  let txResult = await db
    .from("payment_transactions")
    .select("id, status, amount, currency, metadata, order_id")
    .eq("paystack_reference", transactionReference)
    .limit(1);
  if (!txResult.data?.length) {
    // Fallback: app-generated DG- reference used as the primary reference.
    txResult = await db
      .from("payment_transactions")
      .select("id, status, amount, currency, metadata, order_id")
      .eq("reference", transactionReference)
      .limit(1);
  }
  const tx = txResult.data?.[0];
  if (!tx) {
    // Unknown reference: fail closed (no state invented).
    return { ok: false, message: "Unknown transaction for refund event" };
  }

  // Only financially-successful payments can carry refund lifecycle state.
  if (!["successful", "refunded"].includes(tx.status)) {
    return { ok: false, message: `Refund event on non-successful transaction (${tx.status})` };
  }

  const metadata = (tx.metadata ?? {}) as RefundMetadata;
  const existing = metadata.refund;

  // Idempotency: exact same refund id + terminal state already applied → no-op.
  if (
    existing &&
    existing.refund_id != null &&
    refundId != null &&
    String(existing.refund_id) === String(refundId) &&
    TERMINAL_REFUND_STATES.has(existing.status) &&
    existing.status === status
  ) {
    return { ok: true, message: `Refund already ${status}` };
  }

  // Out-of-order tolerance: never regress a terminal state, never go backwards
  // in progression rank for the same refund id.
  if (
    existing &&
    refundId != null &&
    existing.refund_id != null &&
    String(existing.refund_id) === String(refundId) &&
    (TERMINAL_REFUND_STATES.has(existing.status) ||
      STATUS_RANK[status] < STATUS_RANK[existing.status])
  ) {
    return {
      ok: true,
      message: `Ignored out-of-order refund event (${status} after ${existing.status})`,
    };
  }

  const now = new Date().toISOString();
  const history = [...(existing?.history ?? []), { status, at: now }].slice(-20);
  const refundMeta: RefundMetadata["refund"] = {
    status,
    refund_id: refundId ?? existing?.refund_id,
    amount: payload?.amount ?? existing?.amount,
    currency: payload?.currency ?? existing?.currency,
    processed_at: status === "processed" ? now : existing?.processed_at,
    updated_at: now,
    note: typeof payload?.note === "string" ? payload.note.slice(0, 200) : existing?.note,
    history,
  };

  const nextMetadata: RefundMetadata = { ...metadata, refund: refundMeta };

  // Provider-authoritative application state transitions:
  //  - processed → transaction refunded; order → refunded (financial display)
  //  - failed    → transaction back to successful (payment remains received)
  //  - others    → transaction stays successful; metadata carries the state
  const updates: Record<string, unknown> = {
    metadata: nextMetadata,
    updated_at: now,
  };
  if (status === "processed") updates.status = "refunded";
  if (status === "failed" && tx.status === "refunded") updates.status = "successful";

  const { error } = await db.from("payment_transactions").update(updates).eq("id", tx.id);
  if (error) {
    return { ok: false, message: "Refund state persistence failed" };
  }

  if (status === "processed" && tx.order_id) {
    // Mirror to order for financial display truth. Best-effort; the
    // transaction row is the canonical refund record.
    await db.from("orders").update({ status: "refunded" }).eq("id", tx.order_id);
  }

  return { ok: true, message: `Refund ${status} recorded` };
}
