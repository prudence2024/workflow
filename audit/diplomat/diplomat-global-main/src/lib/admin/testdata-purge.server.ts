import "@tanstack/react-start/server-only";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireOwner, logAudit } from "./admin-ops.server";
import { createDatabaseClient } from "../database.server";
import { checkRateLimit } from "../rate-limit.server";

/**
 * §14 — Owner-only TEST DATA purge.
 *
 * DESTRUCTIVE, but strictly bounded:
 * - Server-side Owner authorization (requireOwner) on BOTH preview and execute.
 * - Selection is explicit: date window and/or exact order reference and/or
 *   exact email. "Test" is NEVER inferred from guesses.
 * - mode=preview (the default) shows exact counts, samples, dependencies and
 *   FK-protected records. Execute only ever deletes orders that were part of
 *   that same explicit selection.
 * - FK-safe deletion order. Financial-ledger-protected orders
 *   (payment_financial_completions rows exist) are reported and left intact.
 * - Every execute writes a permanent audit_logs entry with the full manifest.
 */

const CONFIRMATION_PHRASE = "PURGE TEST DATA";

const inputSchema = z
  .object({
    mode: z.enum(["preview", "execute"]).default("preview"),
    confirmation: z.string().optional(),
    created_before: z.string().optional(),
    created_after: z.string().optional(),
    order_reference: z.string().optional(),
    email: z.string().email().optional(),
    include_customers: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "execute") {
      if (data.confirmation !== CONFIRMATION_PHRASE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmation"],
          message: `Confirmation phrase must be exactly: ${CONFIRMATION_PHRASE}`,
        });
      }
    }
    const hasFilter = Boolean(
      data.created_before || data.created_after || data.order_reference || data.email,
    );
    if (!hasFilter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["created_before"],
        message: "At least one explicit filter is required — never purge blindly.",
      });
    }
  });

type OrderRow = {
  id: string;
  reference: string;
  email: string;
  status: string;
  total: number;
  created_at: string;
  customer_id: string | null;
  order_items: { id: string }[] | null;
  receipts: { id: string }[] | null;
  payment_transactions: { id: string }[] | null;
  review_claims: { id: string }[] | null;
};

export const ownerTestdataPurge = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    // Defense-in-depth on a destructive endpoint: even a compromised Owner
    // session cannot machine-gun preview/execute calls past the Upstash limiter.
    const rl = await checkRateLimit("admin-mutation");
    if (rl.configured && !rl.success) {
      return { ok: false as const, message: "Too many purge attempts. Wait a minute and retry." };
    }

    const db = createDatabaseClient();

    // ── 1. Select orders by the explicit filters ─────────────────────────
    let query = db
      .from("orders")
      .select(
        "id, reference, email, status, total, created_at, customer_id, order_items(id), receipts(id), payment_transactions(id), review_claims(id)",
      )
      .order("created_at")
      .limit(500);
    if (data.created_before) query = query.lt("created_at", data.created_before);
    if (data.created_after) query = query.gte("created_at", data.created_after);
    if (data.order_reference) query = query.eq("reference", data.order_reference.trim());
    if (data.email) query = query.eq("email", data.email.trim().toLowerCase());

    const { data: orders, error } = await query;
    if (error) return { ok: false as const, message: `Lookup failed: ${error.message}` };
    const selected = (orders ?? []) as unknown as OrderRow[];
    if (selected.length === 500) {
      // Selection cap reached: refuse rather than silently purging a subset.
      // The Owner must narrow the filters (date range / reference / email) —
      // "the rest looked like test data too" is never an acceptable inference.
      return {
        ok: false as const,
        message:
          "Selection exceeds the 500-order safety cap. Narrow the filters (smaller date window, exact reference, or exact email) and re-run the preview.",
      };
    }
    if (selected.length === 0) {
      return {
        ok: true as const,
        mode: data.mode,
        samples: [],
        counts: {
          orders: 0,
          order_items: 0,
          receipts: 0,
          payment_transactions: 0,
          review_claims: 0,
          customers: 0,
        },
        blocked: [],
        deletable_orders: 0,
        audit_recorded: false,
      };
    }

    const orderIds = selected.map((o) => o.id);

    // ── 2. Financial ledger protection (undeletable RESTRICT rows) ────────
    const { data: completions, error: finError } = await db
      .from("payment_financial_completions")
      .select("order_id")
      .in("order_id", orderIds)
      .limit(1000);
    if (finError)
      return { ok: false as const, message: `Ledger check failed: ${finError.message}` };
    const blockedOrderIds = new Set((completions ?? []).map((c) => c.order_id));
    const blocked = selected
      .filter((o) => blockedOrderIds.has(o.id))
      .map((o) => ({
        reference: o.reference,
        reason: "Protected: financial completion ledger rows exist (exactly-once record)",
      }));

    const deletable = selected.filter((o) => !blockedOrderIds.has(o.id));
    const deletableIds = deletable.map((o) => o.id);

    // ── 3. Customers whose EVERY order is in the deletable set ────────────
    const candidateCustomerIds = [
      ...new Set(deletable.map((o) => o.customer_id).filter((v): v is string => Boolean(v))),
    ];
    let removableCustomers: string[] = [];
    if (data.include_customers && candidateCustomerIds.length > 0) {
      // Any order outside the purge set still referencing the customer blocks removal.
      const { data: external, error: extError } = await db
        .from("orders")
        .select("customer_id")
        .in("customer_id", candidateCustomerIds)
        .not("id", "in", `(${deletableIds.join(",")})`)
        .limit(1);
      if (extError)
        return { ok: false as const, message: `Customer check failed: ${extError.message}` };
      const externallyLinked = new Set((external ?? []).map((r) => r.customer_id));
      removableCustomers = candidateCustomerIds.filter((cid) => !externallyLinked.has(cid));
    }

    const counts = {
      orders: selected.length,
      order_items: selected.reduce((n, o) => n + (o.order_items?.length ?? 0), 0),
      receipts: selected.reduce((n, o) => n + (o.receipts?.length ?? 0), 0),
      payment_transactions: selected.reduce((n, o) => n + (o.payment_transactions?.length ?? 0), 0),
      review_claims: selected.reduce((n, o) => n + (o.review_claims?.length ?? 0), 0),
      customers: removableCustomers.length,
    };

    const samples = selected.slice(0, 20).map((o) => ({
      reference: o.reference,
      status: o.status,
      total: o.total,
      email: o.email,
      created_at: o.created_at,
    }));

    if (data.mode === "preview") {
      return {
        ok: true as const,
        mode: "preview" as const,
        samples,
        counts,
        blocked,
        deletable_orders: deletableIds.length,
        audit_recorded: false,
      };
    }

    // ── 4. EXECUTE — only the exact selected ids, FK-safe order ───────────
    const manifest = {
      filters: {
        created_before: data.created_before ?? null,
        created_after: data.created_after ?? null,
        order_reference: data.order_reference ?? null,
        email: data.email ?? null,
        include_customers: data.include_customers,
      },
      counts,
      order_ids: deletableIds,
      customer_ids: removableCustomers,
      blocked,
      executed_at: new Date().toISOString(),
    };

    const errors: string[] = [];
    if (deletableIds.length > 0) {
      // Children first for determinism (most would cascade anyway); then orders.
      const steps: Array<[string, () => ReturnType<ReturnType<typeof db.from>["delete"]>]> = [
        ["review_claims", () => db.from("review_claims").delete().in("order_id", deletableIds)],
        ["receipts", () => db.from("receipts").delete().in("order_id", deletableIds)],
        [
          "payment_transactions",
          () => db.from("payment_transactions").delete().in("order_id", deletableIds),
        ],
        [
          "coupon_reservations",
          () => db.from("coupon_reservations").delete().in("order_id", deletableIds),
        ],
        ["order_items", () => db.from("order_items").delete().in("order_id", deletableIds)],
        ["orders", () => db.from("orders").delete().in("id", deletableIds)],
      ];
      for (const [table, run] of steps) {
        const { error: stepError } = await run();
        if (stepError) errors.push(`${table}: ${stepError.message}`);
      }
      if (removableCustomers.length > 0 && errors.length === 0) {
        const { error: custError } = await db
          .from("customers")
          .delete()
          .in("id", removableCustomers);
        if (custError) errors.push(`customers: ${custError.message}`);
      }
    }

    // ── 5. Permanent audit evidence (clerk-attributed via logAudit) ───────
    await logAudit(
      "testdata.purge",
      "test_data",
      manifest.executed_at,
      manifest as unknown as Record<string, string | number | boolean | null>,
    );

    if (errors.length > 0) {
      return {
        ok: false as const,
        mode: "execute" as const,
        message: `Purge partially failed — review audit log: ${errors.join("; ")}`,
        samples,
        counts,
        blocked,
        deletable_orders: 0,
        audit_recorded: true,
      };
    }
    return {
      ok: true as const,
      mode: "execute" as const,
      samples,
      counts,
      blocked,
      deletable_orders: deletableIds.length,
      audit_recorded: true,
    };
  });
