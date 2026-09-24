/**
 * PDF attachment contract for the paid-order confirmation email.
 *
 * Guarantees under test:
 *  - attachment is rendered from the canonical receipt document (same data as
 *    the Download Receipt button), filename follows the required pattern;
 *  - attachment/email failure NEVER downgrades the paid order and never
 *    deletes the receipt;
 *  - email retries never recreate financial completion (no second ledger,
 *    inventory, coupon or receipt mutation).
 *
 * Reuses the payment-finalization-v1 harness (mocked email transport, real
 * PostgREST query serialization, RPC financial boundary).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  verify: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  email: vi.fn(),
  telegram: vi.fn(),
  lowStock: vi.fn(),
  stockTelegram: vi.fn(),
  pdfFail: false,
}));
// Flag-driven PDF failure injection: deterministic and hoist-safe (unlike
// vi.doMock, which cannot reliably invalidate an already-imported module).
vi.mock("../src/lib/receipt-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/receipt-pdf")>();
  return {
    ...actual,
    generateReceiptPdf: (...args: unknown[]) => {
      if (state.pdfFail) throw new Error("PDF renderer unavailable");
      return actual.generateReceiptPdf(...(args as Parameters<typeof actual.generateReceiptPdf>));
    },
  };
});
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

const orderId = "33333333-3333-4333-8333-333333333333";
const transactionId = "44444444-4444-4444-8444-444444444444";
const reference = "DG-PDFTEST-0001";
const productId = "11111111-1111-4111-8111-111111111111";
const receiptToken = "55555555-5555-4555-8555-555555555555";
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let requests: { method: string; table: string; body?: Row }[] = [];
let rpcResponse: () => Promise<Response>;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function seed() {
  const quote = {
    subtotal: 85000,
    discount: 0,
    delivery_fee: 10000,
    total: 95000,
    currency: "NGN",
    coupon_id: null,
    items: [
      {
        product_id: productId,
        sku: "FIX",
        name: "Fixture",
        quantity: 1,
        unit_price: 85000,
        line_total: 85000,
      },
    ],
  };
  rows = {
    orders: [
      {
        id: orderId,
        reference,
        email: "fixture@example.invalid",
        status: "pending",
        subtotal: quote.subtotal,
        discount: quote.discount,
        delivery_fee: quote.delivery_fee,
        total: quote.total,
        currency: "NGN",
        coupon_id: null,
        payment_reference: null,
        shipping_address: {
          full_name: "Fixture Buyer",
          phone: "+2348012345678",
          address: "1 Fixture Way",
          city: "Ikeja",
          lga: "Ikeja",
          state: "Lagos",
        },
      },
    ],
    order_items: [
      {
        order_id: orderId,
        product_id: productId,
        sku: "FIX",
        name: "Fixture",
        quantity: 1,
        unit_price: 85000,
        line_total: 85000,
      },
    ],
    customers: [],
    payment_transactions: [
      {
        id: transactionId,
        order_id: orderId,
        reference,
        paystack_reference: null,
        amount: 95000,
        currency: "NGN",
        status: "pending",
        metadata: {
          financial_finalization_version: 1,
          quote_version: 2,
          order_id: orderId,
          order_reference: reference,
          quote,
        },
      },
    ],
    inventory: [{ product_id: productId, quantity: 10, reserved: 0 }],
    coupons: [],
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
  // RPC supplies already-committed state: mutate the fixture rows exactly as
  // the real database transaction would before responding.
  rpcResponse = async () => {
    rows.orders[0].status = "paid";
    rows.orders[0].payment_reference = reference;
    rows.payment_transactions[0].status = "successful";
    return json({ complete: true, already_complete: false, order_id: orderId });
  };
}

beforeEach(async () => {
  seed();
  // Provider key must exist for paystack.server's header construction before
  // the fetch stub is reached (the v1 harness stubs the same fixture value;
  // CI has no ambient PAYSTACK_SECRET_KEY, so the harness must provide it).
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture_not_a_credential");
  state.email.mockClear();
  state.telegram.mockClear();
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      // Paystack verification endpoint (same contract as the v1 harness).
      if (url.origin === "https://api.paystack.co") {
        if (request.method === "GET" && url.pathname === `/transaction/verify/${reference}`)
          return json(await state.verify(reference));
        throw new Error("Unexpected provider fixture request");
      }
      const table = url.pathname.replace("/rest/v1/", "");
      const body = request.method === "GET" ? undefined : JSON.parse(await request.text());
      requests.push({ table, method: request.method, body });
      if (table.startsWith("rpc/")) return rpcResponse();
      let selected = (rows[table] || []).filter((row) =>
        [...url.searchParams].every(([key, value]) => {
          if (["select", "order", "limit", "offset"].includes(key)) return true;
          if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
          if (value.startsWith("in.("))
            return value.slice(4, -1).split(",").includes(String(row[key]));
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
      if (table === "receipts")
        // Shape embedded resources as PostgREST would (object form).
        selected = selected.map((row) => ({
          ...row,
          orders: rows.orders.find((o) => o.id === row.order_id) ?? null,
          payment_transactions:
            rows.payment_transactions.find((t) => t.id === row.transaction_id) ?? null,
        }));
      return json(
        request.headers.get("accept")?.includes("vnd.pgrst.object")
          ? (selected[0] ?? null)
          : selected,
      );
    }),
  );
  state.db = new PostgrestClient("https://pdf-fixture.invalid/rest/v1", {
    retry: false,
    fetch: globalThis.fetch,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const rpcCalls = () => requests.filter((r) => r.table === "rpc/complete_verified_payment_v1");
const financialWrites = () =>
  requests.filter(
    (r) =>
      r.method !== "GET" &&
      ["orders", "payment_transactions", "inventory", "coupons"].includes(r.table),
  );

describe("paid-order receipt email PDF attachment", () => {
  it("attaches a genuine PDF built from the canonical receipt with the required filename", async () => {
    await finalizePayment(reference);
    const customerCall = state.email.mock.calls.find(
      (call) => call[0]?.to === "fixture@example.invalid",
    );
    expect(customerCall).toBeTruthy();
    const attachments = customerCall[0].attachments as
      Array<{ filename: string; contentBase64: string }> | undefined;
    expect(attachments).toHaveLength(1);
    const attachment = attachments![0];
    // Receipt numbers are date-sequenced server-side; assert the required pattern.
    expect(attachment.filename).toMatch(/^Diplomat-Global-Receipt-DG-\d{8}-\d{6}\.pdf$/);
    const bytes = Buffer.from(attachment.contentBase64, "base64");
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(400);
    const text = bytes.toString("latin1");
    expect(text).toContain("/Type /Catalog");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // The automatic email body uses the ONE canonical receipt email template
    // (same as Admin → Receipt table → Resend Email), carrying the real
    // receipt number and the receipt link CTA.
    const body = customerCall[0].html as string;
    expect(body).toContain("View / Print Receipt");
    expect(body).toContain("your payment has been confirmed");
    expect(customerCall[0].subject as string).toContain("Receipt ");
    expect(body).toMatch(/Receipt DG-\d{8}-\d{6}/);
    // These tests build a real PDF; under parallel suite load the render can
    // exceed the 5s default, so they carry an explicit budget.
  }, 30_000);

  it("receipt PDF rendering failure never downgrades paid or blocks the email", async () => {
    state.pdfFail = true;
    try {
      const result = await finalizePayment(reference);
      expect(result).toMatchObject({ ok: true, payment_confirmed: true });
      expect(rows.orders[0].status).toBe("paid");
      expect(rows.receipts).toHaveLength(1);
      const customerCall = state.email.mock.calls.find(
        (call) => call[0]?.to === "fixture@example.invalid",
      );
      expect(customerCall).toBeTruthy();
      expect(customerCall[0].attachments).toBeUndefined();
    } finally {
      state.pdfFail = false;
    }
  }, 30_000);

  it("email retry after delivery failure does not recreate financial completion", async () => {
    state.email.mockImplementation(async (input: { to: string }) => {
      if (input.to === "fixture@example.invalid") throw new Error("email unavailable");
      return { sent: true };
    });
    const first = await finalizePayment(reference);
    expect(first).toMatchObject({ payment_confirmed: true });
    const rpcCount = rpcCalls().length;
    const receiptPosts = () =>
      requests.filter((r) => r.method === "POST" && r.table === "receipts").length;
    const customerEmailCount = state.email.mock.calls.filter(
      (call) => call[0]?.to === "fixture@example.invalid",
    ).length;
    expect(rpcCount).toBe(1);
    expect(receiptPosts()).toBe(1);
    // Replay of the same successful reference: RPC now reports already_complete.
    rpcResponse = async () => json({ complete: true, already_complete: true, order_id: orderId });
    const second = await finalizePayment(reference);
    expect(second).toMatchObject({ payment_confirmed: true });
    // One financial commit per successful reference — never two.
    expect(rpcCalls().length).toBe(2);
    expect(receiptPosts()).toBe(1);
    // No duplicate email on the replayed (already_complete) finalization.
    expect(
      state.email.mock.calls.filter((call) => call[0]?.to === "fixture@example.invalid").length,
    ).toBe(customerEmailCount);
    // v1 path: the RPC owns every financial mutation; call sites write none.
    expect(financialWrites().length).toBe(0);
  }, 30_000);
});
