import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  verify: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  email: vi.fn(),
  telegram: vi.fn(),
  lowStock: vi.fn(),
  stockTelegram: vi.fn(),
}));
vi.mock("../src/lib/database.server", () => ({ createDatabaseClient: () => state.db }));
vi.mock("../src/lib/admin/payments.server", () => ({
  createTransaction: (...args: unknown[]) => state.create(...args),
  updateTransaction: (...args: unknown[]) => state.update(...args),
}));
vi.mock("../src/lib/email.server", () => ({
  sendTransactionalEmail: (...args: unknown[]) => state.email(...args),
}));
vi.mock("../src/lib/telegram.server", () => ({
  sendPaymentNotification: (...args: unknown[]) => state.telegram(...args),
  sendAdminAlert: (...args: unknown[]) => state.stockTelegram(...args),
}));
vi.mock("../src/lib/notifications", () => ({
  notifications: new Proxy(
    {},
    {
      get: (_, key) =>
        key === "lowStock"
          ? (...args: unknown[]) => state.lowStock(...args)
          : async () => undefined,
    },
  ),
}));
import { finalizePayment } from "../src/lib/payment-finalize.server";
import { createPaymentAttempt } from "../src/lib/checkout.server";
import { buildCheckoutQuote } from "../src/lib/checkout-quote";

const orderId = "33333333-3333-4333-8333-333333333333";
const transactionId = "44444444-4444-4444-8444-444444444444";
const reference = "DG-V1TEST-0001";
const productId = "11111111-1111-4111-8111-111111111111";
const receiptToken = "55555555-5555-4555-8555-555555555555";
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let requests: { method: string; table: string; body?: Row; filters: URLSearchParams }[];
let rpcResponse: () => Promise<Response>;
let receiptFailure: "none" | "error" | "throws";
let orderReadFailure: boolean;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
function seed(v1 = true, withCoupon = false, multi = false) {
  const products = [
    {
      id: productId,
      sku: "FIX",
      name: "Fixture",
      price: 85000,
      status: "active",
      inventory: { quantity: 10 },
    },
  ];
  if (multi)
    products.push({
      ...products[0],
      id: "22222222-2222-4222-8222-222222222222",
      sku: "FIX2",
      name: "Second",
      price: 5000,
    });
  const coupon = withCoupon
    ? {
        id: "66666666-6666-4666-8666-666666666666",
        code: "SAVE",
        discount_type: "fixed" as const,
        discount_value: 5000,
        uses: 0,
        max_uses: 5,
        active: true,
        starts_at: null,
        expires_at: null,
      }
    : null;
  const quote = buildCheckoutQuote({
    items: products.map((p) => ({ productId: p.id, quantity: 1 })),
    products,
    coupon,
    couponRequested: withCoupon,
    deliveryFee: 10000,
    freeDeliveryEnabled: false,
    freeDeliveryThreshold: 0,
  });
  rows = {
    orders: [
      {
        id: orderId,
        reference,
        email: "fixture@example.invalid",
        customer_id: "33333333-3333-4333-8333-333333333333",
        status: "pending",
        payment_reference: null,
        subtotal: quote.subtotal,
        discount: quote.discount,
        delivery_fee: quote.delivery_fee,
        total: quote.total,
        currency: "NGN",
        coupon_id: quote.coupon_id,
        customers: null,
      },
    ],
    order_items: quote.items.map(({ cost_price: _cost, ...i }) => ({ ...i, order_id: orderId })),
    payment_transactions: [
      {
        id: transactionId,
        order_id: orderId,
        reference,
        paystack_reference: reference,
        amount: quote.total,
        currency: "NGN",
        status: "pending",
        metadata: {
          ...(v1 ? { financial_finalization_version: 1 } : {}),
          quote_version: 2,
          order_id: orderId,
          order_reference: reference,
          quote,
        },
      },
    ],
    inventory: products.map((p) => ({ product_id: p.id, quantity: 10, reserved: 0 })),
    products: products.map((p) => ({ id: p.id, name: p.name })),
    review_claims: [],
    coupons: coupon ? [coupon] : [],
    receipts: [],
    audit_logs: [],
    site_settings: [
      { key: "company_name", value: "Fixture & Sons" },
      { key: "support_email", value: "support@example.invalid" },
      { key: "website_url", value: "https://business.example.invalid" },
    ],
  };
  state.verify.mockResolvedValue({
    status: true,
    data: { reference, amount: quote.total * 100, currency: "NGN", status: "success" },
  });
  return quote;
}
// Application orchestration adapter, NOT a PostgreSQL atomicity simulator.
// RPC supplies already-committed state; no stock/coupon transaction algorithm is reimplemented.
function committed(already = false) {
  rows.orders[0].status = "paid";
  rows.orders[0].payment_reference = reference;
  rows.payment_transactions[0].status = "successful";
  return json({ complete: true, already_complete: already, order_id: orderId });
}
const rpcCalls = () => requests.filter((r) => r.table === "rpc/complete_verified_payment_v1");
const financialWrites = () =>
  requests.filter(
    (r) =>
      r.method !== "GET" &&
      ["orders", "payment_transactions", "inventory", "coupons"].includes(r.table),
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED", "false");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture_not_a_credential");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_URL", "preview.example.invalid");
  vi.stubEnv("REVIEW_CLAIMS_HASH_SECRET", "review-claims-fixture-secret-not-a-credential");
  state.email.mockResolvedValue({ sent: true });
  state.telegram.mockResolvedValue(undefined);
  state.initialize.mockResolvedValue({
    status: true,
    data: { reference, authorization_url: "https://fixture.invalid/pay" },
  });
  state.create.mockResolvedValue({ id: transactionId });
  state.update.mockResolvedValue(undefined);
  requests = [];
  receiptFailure = "none";
  orderReadFailure = false;
  seed();
  rpcResponse = async () => committed();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    // Exercise the real provider adapter too; every request is intercepted locally.
    if (url.origin === "https://api.paystack.co") {
      if (request.method === "GET" && url.pathname === `/transaction/verify/${reference}`)
        return json(await state.verify(reference));
      if (request.method === "POST" && url.pathname === "/transaction/initialize")
        return json(await state.initialize(JSON.parse(await request.text())));
      throw new Error("Unexpected provider fixture request");
    }
    expect(url.origin).toBe("https://payment-fixture.invalid");
    const table = url.pathname.replace("/rest/v1/", "");
    const body = request.method === "GET" ? undefined : JSON.parse(await request.text());
    requests.push({ table, method: request.method, body, filters: url.searchParams });
    if (table.startsWith("rpc/")) return rpcResponse();
    if (table === "receipts" && receiptFailure !== "none") {
      if (receiptFailure === "throws") throw new Error("Receipt network unavailable");
      return json({ code: "08006", message: "fixture DB unavailable" }, 503);
    }
    if (table === "orders" && orderReadFailure && rpcCalls().length)
      return json({ message: "read unavailable" }, 503);
    let selected = (rows[table] || []).filter((row) =>
      [...url.searchParams].every(([key, value]) => {
        if (["select", "order", "limit", "offset"].includes(key)) return true;
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("in.("))
          return value.slice(4, -1).split(",").includes(String(row[key]));
        if (value.startsWith("lt.")) return Number(row[key]) < Number(value.slice(3));
        if (value.startsWith("like."))
          return String(row[key]).startsWith(value.slice(5).replace(/[%*]$/, ""));
        throw new Error("Unsupported filter " + value);
      }),
    );
    if (request.method === "PATCH") selected.forEach((row) => Object.assign(row, body));
    if (request.method === "POST") {
      selected = [{ ...(table === "receipts" ? { download_token: receiptToken } : {}), ...body }];
      (rows[table] ||= []).push(...selected);
    }
    if (table === "orders")
      selected = selected.map((row) => ({
        ...row,
        order_items: rows.order_items.filter((i) => i.order_id === row.id),
      }));
    if (table === "review_claims") {
      const existing = selected[0];
      if (request.method === "POST" && !existing) {
        const inserted = { ...body };
        rows.review_claims.push(inserted);
        return json(request.headers.get("accept")?.includes("vnd.pgrst.object") ? inserted : [inserted]);
      }
      if (request.method === "DELETE") {
        rows.review_claims = rows.review_claims.filter(
          (c) =>
            !(url.searchParams.get("order_id") === `eq.${c.order_id}` &&
              url.searchParams.get("product_id") === `eq.${c.product_id}`),
        );
        return json([]);
      }
    }
    return json(
      request.headers.get("accept")?.includes("vnd.pgrst.object")
        ? (selected[0] ?? null)
        : selected,
    );
  });
  state.db = new PostgrestClient("https://payment-fixture.invalid/rest/v1", {
    // Exercise query serialization without SDK retry sleeps leaking across tests.
    retry: false,
    fetch: globalThis.fetch,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("safe payment rollout and orchestration", () => {
  for (const enabled of [undefined, "false", "true"])
    it(`checkout gate ${enabled ?? "unset"} tags only explicitly enabled attempts`, async () => {
      if (enabled === undefined) delete process.env.PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED;
      else vi.stubEnv("PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED", enabled);
      const quote = seed();
      await createPaymentAttempt({
        db: state.db as never,
        order: { id: orderId, reference },
        quote,
        email: "fixture@example.invalid",
        checkoutAttemptId: "77777777-7777-4777-8777-777777777777",
        attemptType: "initial",
      });
      expect(state.create.mock.calls[0][0].metadata.financial_finalization_version).toBe(
        enabled === "true" ? 1 : undefined,
      );
      expect(rpcCalls()).toHaveLength(0);
    });
  it("accepts approved SQL response and reads committed order by returned ID", async () => {
    expect(await finalizePayment(reference)).toMatchObject({
      ok: true,
      payment_confirmed: true,
      receipt_token: receiptToken,
    });
    expect(rpcCalls()).toHaveLength(1);
    expect(financialWrites()).toHaveLength(0);
    expect(requests.filter((r) => r.table === "orders")).toHaveLength(2);
    expect(rpcCalls()[0].body).toMatchObject({
      p_transaction_id: transactionId,
      p_reference: reference,
      p_amount_kobo: 9500000,
      p_currency: "NGN",
    });
  });
  it("emails use receipt Settings identity and trusted deployment links", async () => {
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    const deliveries = state.email.mock.calls.map(([email]) => email);
    const customer = deliveries.find((email) => email.to === "fixture@example.invalid");
    const admin = deliveries.find((email) => email.to !== "fixture@example.invalid");
    expect(customer.html).toContain("Fixture &amp; Sons");
    expect(customer.html).toContain("support@example.invalid");
    expect(customer.html).toContain("https://business.example.invalid/");
    expect(customer.html).toContain(`https://preview.example.invalid/api/receipt/${receiptToken}`);
    expect(admin.html).toContain("https://preview.example.invalid/dashboard/orders");
    expect(customer.html + admin.html).not.toContain("diplomatglobal.com");
  });
  it("missing business configuration cannot downgrade paid or send invented identity", async () => {
    rows.site_settings = [];
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    // No receipt/confirmation email is possible without business identity;
    // only the purchaser-delivered review-claim link (transactional, no
    // business branding) may be sent.
    const claimOnly = state.email.mock.calls.map(([email]) => email);
    expect(claimOnly.every((email) => String(email.subject).startsWith("Share your verified review"))).toBe(
      true,
    );
  });
  it("unsafe Settings website is omitted from customer email", async () => {
    rows.site_settings.find((r) => r.key === "website_url")!.value = "javascript:alert(1)";
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    expect(state.email.mock.calls.map(([email]) => email.html).join("")).not.toContain(
      "javascript:",
    );
  });
  it("existing v1 with missing RPC fails safely even when creation flag is off", async () => {
    rpcResponse = async () => json({ code: "PGRST202", message: "function missing" }, 404);
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(financialWrites()).toHaveLength(0);
    expect(rows.orders[0].status).toBe("pending");
  });
  it("transport failure before RPC result safely retries without fallback", async () => {
    rpcResponse = async () => {
      throw new Error("connection interrupted");
    };
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    rpcResponse = async () => committed();
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    expect(financialWrites()).toHaveLength(0);
  });
  for (const data of [
    { complete: true },
    { complete: false, already_complete: false, order_id: orderId },
    { complete: true, already_complete: false, order: {} },
  ])
    it("rejects malformed RPC response", async () => {
      rpcResponse = async () => json(data);
      expect(await finalizePayment(reference)).toMatchObject({ ok: false });
      expect(financialWrites()).toHaveLength(0);
    });
  it("legacy attempt never calls missing RPC and retains stock CAS", async () => {
    seed(false);
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    expect(rpcCalls()).toHaveLength(0);
    expect(rows.inventory[0].quantity).toBe(9);
  });
  it.each([false, true])(
    "legacy payment honors stored threshold and alerts=%s",
    { timeout: 60_000 },
    async (enabled) => {
      seed(false);
      state.lowStock.mockClear();
      state.stockTelegram.mockClear();
      rows.inventory[0].low_stock_threshold = 9;
      rows.site_settings.push({ key: "low_stock_alerts_enabled", value: String(enabled) });
      expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
      expect(rows.inventory[0].quantity).toBe(9);
      expect(state.lowStock).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(state.stockTelegram).toHaveBeenCalledTimes(enabled ? 1 : 0);
      await finalizePayment(reference);
      expect(state.lowStock).toHaveBeenCalledTimes(enabled ? 1 : 0);
    },
    // The alerts path awaits best-effort notification mocks; under full-suite
    // parallelism this can exceed the default 5s budget on slow CI machines.
    15000,
  );
  it("frozen historical reference is rejected before any DB/provider access", async () => {
    expect(await finalizePayment("DG-MTLML9QG-WWA7")).toMatchObject({ ok: false });
    expect(requests).toHaveLength(0);
    expect(state.verify).not.toHaveBeenCalled();
  });
  for (const failure of ["error", "throws"] as const)
    it(`receipt ${failure} keeps paid authority and retry only resumes safe receipt creation`, async () => {
      receiptFailure = failure;
      expect(await finalizePayment(reference)).toMatchObject({
        payment_confirmed: true,
        receipt_pending: true,
      });
      const emailCount = state.email.mock.calls.length;
      receiptFailure = "none";
      rpcResponse = async () => committed(true);
      expect(await finalizePayment(reference)).toMatchObject({
        payment_confirmed: true,
        already_processed: true,
        receipt_token: receiptToken,
      });
      expect(state.email).toHaveBeenCalledTimes(emailCount);
      expect(financialWrites()).toHaveLength(0);
    });
  it("already-complete after lost commit response resumes receipt, never blindly resends emails", async () => {
    rpcResponse = async () => {
      committed();
      throw new Error("lost response");
    };
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    rpcResponse = async () => committed(true);
    expect(await finalizePayment(reference)).toMatchObject({
      payment_confirmed: true,
      receipt_token: receiptToken,
    });
    expect(state.email).not.toHaveBeenCalled();
    expect(financialWrites()).toHaveLength(0);
  });
  for (const target of ["admin", "customer", "telegram"])
    it(`${target} delivery failure cannot revert paid`, async () => {
      if (target === "telegram")
        state.telegram.mockRejectedValue(new Error("provider unavailable"));
      else
        state.email.mockImplementation(async (input: { to: string }) => {
          if ((target === "customer") === (input.to === "fixture@example.invalid"))
            throw new Error("email unavailable");
          return { sent: true };
        });
      expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    });
  it("post-commit order read failure preserves verified paid result", async () => {
    orderReadFailure = true;
    expect(await finalizePayment(reference)).toMatchObject({
      payment_confirmed: true,
      receipt_pending: true,
    });
    expect(state.email).not.toHaveBeenCalled();
  });
  for (const callers of [
    ["callback", "webhook"],
    ["callback", "success recheck"],
  ])
    it(`${callers.join(" + ")} converge on RPC contract`, async () => {
      let first = true;
      rpcResponse = async () => {
        const already = !first;
        first = false;
        return committed(already);
      };
      const results = await Promise.all(callers.map(() => finalizePayment(reference)));
      expect(results.every((r) => r.payment_confirmed)).toBe(true);
      expect(rpcCalls()).toHaveLength(2);
      expect(financialWrites()).toHaveLength(0);
      // Two receipt/confirmation emails (one per finalized call) plus at most
      // ONE idempotent review-claim link: replays reuse the live claim and
      // never re-deliver a token (rawToken=null on the second issuance).
      expect(state.email.mock.calls.filter(([e]) => !String(e.subject).startsWith("Share your verified review"))).toHaveLength(2);
      expect(state.email.mock.calls.filter(([e]) => String(e.subject).startsWith("Share your verified review"))).toHaveLength(1);
    });
  it("matching multi-product quote reaches RPC with exact total", async () => {
    seed(true, false, true);
    expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
    expect(rpcCalls()[0].body?.p_amount_kobo).toBe(10000000);
  });
  for (const withCoupon of [false, true])
    it(`coupon=${withCoupon} delegates all financial effects to RPC`, async () => {
      seed(true, withCoupon);
      expect(await finalizePayment(reference)).toMatchObject({ payment_confirmed: true });
      expect(requests.some((r) => ["inventory", "coupons"].includes(r.table))).toBe(false);
    });
  it("SQL shortage error triggers no application financial writes", async () => {
    rpcResponse = async () => json({ message: "Inventory requires reconciliation" }, 400);
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(financialWrites()).toHaveLength(0);
  });
  it("wrong immutable quote rejects before RPC", async () => {
    rows.order_items[0].quantity = 2;
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(rpcCalls()).toHaveLength(0);
  });
  it("provider verification transport failure fails closed with zero financial mutation", async () => {
    state.verify.mockRejectedValue(new Error("provider unreachable"));
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(rpcCalls()).toHaveLength(0);
    expect(financialWrites()).toHaveLength(0);
    expect(rows.orders[0].status).toBe("pending");
  });
  it("refunded attempt replay stays refunded with zero financial mutation", async () => {
    // Mirror of the production refunded order: financially completed once,
    // then provider-reversed (Paystack verify still echoes gateway_response
    // "Successful" for the original authorization).
    rows.payment_transactions[0].status = "refunded";
    rows.orders[0].status = "refunded";
    state.verify.mockResolvedValue({
      status: true,
      data: {
        reference,
        amount: 9500000,
        currency: "NGN",
        status: "reversed",
        gateway_response: "Successful",
      },
    });
    const result = await finalizePayment(reference);
    expect(result).toMatchObject({
      ok: false,
      failure_kind: "declined",
      provider_status: "reversed",
      // The stale provider "Successful" echo must never surface as the reason.
      provider_reason: "reversed",
    });
    expect(result.message).not.toContain("Successful");
    expect(rpcCalls()).toHaveLength(0);
    // Refund monotonicity: the attempt-outcome write's status guard must not
    // flip a refunded transaction to failed, and nothing restores "paid".
    expect(rows.payment_transactions[0].status).toBe("refunded");
    expect(rows.orders[0].status).toBe("refunded");
    // No receipt resurrection, no post-completion email replay.
    expect(rows.receipts).toHaveLength(0);
    expect(state.email).not.toHaveBeenCalled();
  });
  it("provider status=failed fails closed and never reaches the financial boundary", async () => {
    state.verify.mockResolvedValue({
      status: true,
      data: { reference, amount: 9500000, currency: "NGN", status: "failed" },
    });
    const result = await finalizePayment(reference);
    expect(result).toMatchObject({
      ok: false,
      failure_kind: "declined",
      provider_status: "failed",
    });
    expect(rpcCalls()).toHaveLength(0);
    // The ONLY permitted write is the truthful attempt-outcome record on the
    // transaction itself (status='failed' + gateway reason), which is exactly
    // how a provider-declined attempt is durably surfaced. No order/inventory/
    // coupon mutation is allowed.
    expect(financialWrites()).toHaveLength(1);
    expect(financialWrites()[0]).toMatchObject({
      method: "PATCH",
      table: "payment_transactions",
    });
    expect(rows.orders[0].status).toBe("pending");
  });
  it("provider amount mismatch is rejected before the financial boundary", async () => {
    state.verify.mockResolvedValue({
      status: true,
      data: { reference, amount: 9400000, currency: "NGN", status: "success" },
    });
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(rpcCalls()).toHaveLength(0);
    expect(financialWrites()).toHaveLength(0);
    expect(rows.orders[0].status).toBe("pending");
  });
  it("provider currency mismatch is rejected before the financial boundary", async () => {
    state.verify.mockResolvedValue({
      status: true,
      data: { reference, amount: 9500000, currency: "USD", status: "success" },
    });
    expect(await finalizePayment(reference)).toMatchObject({ ok: false });
    expect(rpcCalls()).toHaveLength(0);
    expect(financialWrites()).toHaveLength(0);
    expect(rows.orders[0].status).toBe("pending");
  });
  it("callback + webhook + success recheck race converges on exactly one completion", async () => {
    let calls = 0;
    const completions: boolean[] = [];
    rpcResponse = async () => {
      const already = calls++ > 0;
      completions.push(already);
      return committed(already);
    };
    const results = await Promise.all([
      finalizePayment(reference),
      finalizePayment(reference),
      finalizePayment(reference),
    ]);
    expect(results.every((r) => r.payment_confirmed)).toBe(true);
    expect(rpcCalls()).toHaveLength(3);
    expect(completions.filter((already) => already)).toHaveLength(2);
    expect(completions.filter((already) => !already)).toHaveLength(1);
    expect(financialWrites()).toHaveLength(0);
    expect(rows.inventory[0].quantity).toBe(10);
  });
});
