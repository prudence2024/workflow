import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { identityOf } from "@/lib/auth";
import { canonicalPlanKey, type SelectablePlanKey } from "@/lib/plans";
import { NGN_PRICES } from "@/lib/pricing";
import { withPrivilegedContext, withTenant, type TenantTx } from "@/lib/tenant";

export type PaymentStatus = "pending" | "verified" | "failed" | "cancelled" | "refunded";
export type PaymentRow = typeof payments.$inferSelect;

export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super("Payment provider is not configured");
    this.name = "PaymentProviderUnavailableError";
  }
}

export class PaymentVerificationError extends Error {
  constructor(message = "Payment could not be verified") {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

const PAYSTACK_VERIFY_TIMEOUT_MS = 15_000;

export type ReceiptPaymentRow = PaymentRow & {
  customer_name: string | null;
  customer_email: string | null;
  workspace_name: string;
};

export function toReceiptPaymentInput(payment: ReceiptPaymentRow) {
  return {
    id: payment.id,
    receipt_number: payment.receiptNumber,
    provider_reference: payment.providerReference,
    provider_transaction_id: payment.providerTransactionId,
    customer_name: payment.customer_name,
    customer_email: payment.customer_email,
    workspace_name: payment.workspace_name,
    plan_key: payment.planKey,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    payment_method_summary: payment.paymentMethodSummary,
    billing_period_start: payment.billingPeriodStart,
    billing_period_end: payment.billingPeriodEnd,
    paid_at: payment.paidAt,
    provider: payment.provider,
  };
}

export async function listPaymentsForWorkspace(user: CurrentUser, orgId: string): Promise<PaymentRow[]> {
  return withTenant(identityOf(user), orgId, async (tx) =>
    tx.select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)),
  );
}

export async function getVerifiedPaymentForWorkspace(
  user: CurrentUser,
  orgId: string,
  paymentId: string,
): Promise<ReceiptPaymentRow | null> {
  return withTenant(identityOf(user), orgId, async (tx) => {
    const result = await tx.execute<ReceiptPaymentRow>(sql`
      select p.id, p.org_id as "orgId", p.user_id as "userId", p.provider,
             p.provider_reference as "providerReference", p.provider_transaction_id as "providerTransactionId",
             p.idempotency_key as "idempotencyKey", p.plan_key as "planKey", p.amount, p.currency, p.status,
             p.payment_method_summary as "paymentMethodSummary", p.receipt_number as "receiptNumber",
             p.paid_at as "paidAt", p.verified_at as "verifiedAt", p.billing_period_start as "billingPeriodStart",
             p.billing_period_end as "billingPeriodEnd", p.created_at as "createdAt", p.updated_at as "updatedAt",
             u.name as customer_name, u.email as customer_email, o.name as workspace_name
        from public.payments p
        join public.organizations o on o.id = p.org_id
        left join public.users u on u.id = p.user_id
       where p.id = ${paymentId}::uuid
         and p.org_id = ${orgId}::uuid
         and p.status = 'verified'
       limit 1
    `);
    return result.rows[0] ?? null;
  });
}

export async function getPaymentForWorkspace(
  user: CurrentUser,
  orgId: string,
  paymentId: string,
): Promise<PaymentRow | null> {
  return withTenant(identityOf(user), orgId, async (tx) => {
    const result = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId))).limit(1);
    return result[0] ?? null;
  });
}

export async function createPendingPayment(input: {
  user: CurrentUser;
  orgId: string;
  providerReference: string;
  idempotencyKey: string;
  planKey: SelectablePlanKey;
  amount: number;
  currency?: string;
}): Promise<PaymentRow> {
  if (input.planKey === "free") throw new PaymentVerificationError("Free plans do not create payments");
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount !== NGN_PRICES[input.planKey]) throw new PaymentVerificationError("Invalid payment amount");
  return withPrivilegedContext(identityOf(input.user), input.orgId, async (tx) => {
    const result = await tx.execute<PaymentRow>(sql`
      insert into public.payments
        (org_id, user_id, provider, provider_reference, idempotency_key, plan_key, amount, currency, status)
      values
        (${input.orgId}::uuid, app.current_user_id(), 'paystack', ${input.providerReference}, ${input.idempotencyKey}, ${input.planKey}, ${input.amount}, ${input.currency ?? "NGN"}, 'pending')
      on conflict (idempotency_key) do nothing
      returning *
    `);
    if (result.rows[0]) return result.rows[0];

    // A client-controlled idempotency key may collide with another workspace.
    // Resolve only within the current tenant; never return or update the
    // conflicting row from another organization.
    const existing = await tx.execute<PaymentRow>(sql`
      select * from public.payments
       where idempotency_key = ${input.idempotencyKey}
         and org_id = ${input.orgId}::uuid
       limit 1
    `);
    if (!existing.rows[0]) throw new Error("Payment record could not be created");
    return existing.rows[0];
  });
}

export async function verifyPaystackReference(input: {
  reference: string;
  expectedAmount: number;
  expectedCurrency: string;
}): Promise<{ providerTransactionId: string; paidAt: Date; paymentMethod: string | null }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new PaymentProviderUnavailableError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYSTACK_VERIFY_TIMEOUT_MS);
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(input.reference)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new PaymentVerificationError();
  const body = await response.json() as {
    status?: boolean;
    data?: { status?: string; reference?: string; amount?: number; currency?: string; id?: number | string; paid_at?: string; channel?: string };
  };
  const data = body.data;
  if (!body.status || data?.status !== "success" || data.reference !== input.reference) throw new PaymentVerificationError();
  if (data.amount !== input.expectedAmount || data.currency?.toUpperCase() !== input.expectedCurrency.toUpperCase()) {
    throw new PaymentVerificationError("Payment amount or currency did not match");
  }
  if (data.id === undefined || data.id === null) throw new PaymentVerificationError("Payment transaction identity was missing");
  const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();
  if (!Number.isFinite(paidAt.getTime())) throw new PaymentVerificationError("Payment timestamp was invalid");
  return {
    providerTransactionId: String(data.id),
    paidAt,
    paymentMethod: data.channel ?? null,
  };
}

/** Idempotent server-side convergence after Paystack verification succeeded. */
export async function convergeVerifiedPayment(input: {
  paymentId: string;
  providerTransactionId: string;
  paidAt: Date;
  paymentMethod: string | null;
}): Promise<PaymentRow> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<PaymentRow>(sql`select * from public.payments where id = ${input.paymentId}::uuid for update`);
    const payment = locked.rows[0];
    if (!payment) throw new PaymentVerificationError("Payment record not found");
    if (payment.status === "verified") return payment;
    if (payment.status !== "pending") throw new PaymentVerificationError("Payment is not pending");
    await assertProviderTransactionAvailable(tx, payment.id, input.providerTransactionId);

    const receiptNumber = `WF-${payment.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const updated = await tx.execute<PaymentRow>(sql`
      update public.payments
         set status = 'verified', provider_transaction_id = ${input.providerTransactionId},
             payment_method_summary = ${input.paymentMethod}, paid_at = ${input.paidAt},
             verified_at = now(), receipt_number = ${receiptNumber}, updated_at = now()
       where id = ${payment.id}::uuid and status = 'pending'
      returning *
    `);
    const verified = updated.rows[0] ?? payment;
    await tx.execute(sql`
      update public.subscriptions
         set plan_key = ${canonicalPlanKey(verified.planKey)}, requested_plan_key = null,
             billing_state = 'active', status = 'active',
             current_period_end = coalesce(current_period_end, now() + interval '30 days')
       where org_id = ${verified.orgId}::uuid
    `);
    // Entitlement checks read organizations.plan_key. Keep that authoritative
    // plan in sync only after the provider verification has converged.
    await tx.execute(sql`
      update public.organizations
         set plan_key = ${canonicalPlanKey(verified.planKey)}
       where id = ${verified.orgId}::uuid
    `);
    return verified;
  });
}

/**
 * Apply a verified Paystack charge notification without trusting the webhook
 * to choose an organization or plan. The provider reference is matched to an
 * existing pending payment, and the provider amount/currency must match the
 * durable payment row before the entitlement is converged.
 */
export async function convergePaystackWebhook(input: {
  reference: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
  paidAt: Date;
  paymentMethod: string | null;
}): Promise<PaymentRow | null> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<PaymentRow>(sql`
      select * from public.payments
       where provider = 'paystack'
         and provider_reference = ${input.reference}
         and status = 'pending'
       for update
    `);
    const payment = locked.rows[0];
    if (!payment) return null;
    if (payment.amount !== input.amount || payment.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new PaymentVerificationError("Payment amount or currency did not match");
    }
    await assertProviderTransactionAvailable(tx, payment.id, input.providerTransactionId);

    const receiptNumber = `WF-${payment.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const updated = await tx.execute<PaymentRow>(sql`
      update public.payments
         set status = 'verified', provider_transaction_id = ${input.providerTransactionId},
             payment_method_summary = ${input.paymentMethod}, paid_at = ${input.paidAt},
             verified_at = now(), receipt_number = ${receiptNumber}, updated_at = now()
       where id = ${payment.id}::uuid and status = 'pending'
      returning *
    `);
    const verified = updated.rows[0] ?? payment;
    await tx.execute(sql`
      update public.subscriptions
         set plan_key = ${canonicalPlanKey(verified.planKey)}, requested_plan_key = null,
             billing_state = 'active', status = 'active',
             current_period_end = coalesce(current_period_end, now() + interval '30 days')
       where org_id = ${verified.orgId}::uuid
    `);
    await tx.execute(sql`
      update public.organizations
         set plan_key = ${canonicalPlanKey(verified.planKey)}
       where id = ${verified.orgId}::uuid
    `);
    return verified;
  });
}

async function assertProviderTransactionAvailable(
  tx: TenantTx,
  paymentId: string,
  providerTransactionId: string,
): Promise<void> {
  const conflict = await tx.execute<{ id: string }>(sql`
    select id from public.payments
     where provider = 'paystack'
       and provider_transaction_id = ${providerTransactionId}
       and id <> ${paymentId}::uuid
     limit 1
  `);
  if (conflict.rows.length > 0) {
    throw new PaymentVerificationError("Payment transaction was already used");
  }
}
