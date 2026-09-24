import { describe, expect, it } from "vitest";
import {
  buildReceiptDocument,
  canAccessFinalizedReceipt,
  generateReceiptHTML,
  isOpaqueReceiptToken,
  type ReceiptRecordInput,
} from "../src/lib/receipt-document";
import { paymentReceiptTemplate } from "../src/lib/email-templates.server";

function finalizedRecord(overrides: Partial<ReceiptRecordInput> = {}): ReceiptRecordInput {
  return {
    receipt: {
      receipt_number: "DG-20260904-000001",
      download_token: "55555555-5555-4555-8555-555555555555",
      customer_email: "ada@example.com",
      items_snapshot: [
        {
          sku: "DG-MON-ZP15",
          name: "Immutable Monitor",
          quantity: 2,
          unit_price: 25_000,
          line_total: 50_000,
        },
      ],
      subtotal: 50_000,
      discount: 500,
      delivery_fee: 10_005,
      total: 59_505,
      currency: "NGN",
      created_at: "2026-09-04T12:05:00.000Z",
    },
    order: {
      reference: "DG-ORDER-1001",
      status: "paid",
      email: "ada@example.com",
      shipping_address: {
        full_name: "Ada Lovelace",
        phone: "+2348012345678",
        address: "14 Receipt Street",
        city: "Ikeja",
        lga: "Ikeja",
        state: "Lagos",
      },
      payment_reference: "DG-PAY-1001",
    },
    transaction: {
      reference: "DG-PAY-1001",
      paystack_reference: "DG-PAY-1001",
      status: "successful",
      channel: "card",
      paid_at: "2026-09-04T12:04:30.000Z",
    },
    settings: {
      company_name: "Diplomat Global",
      tagline: "Configured subsidiary line",
      bn_number: "BN-CONFIGURED",
      support_email: "configured@example.com",
      phone: "+2348099999999",
      location: "Configured business address",
      website_url: "https://configured.example.com",
    },
    ...overrides,
  };
}

describe("authoritative digital receipt document", () => {
  it("exposes receipts only for a finalized order and successful transaction", () => {
    expect(canAccessFinalizedReceipt("paid", "successful")).toBe(true);
    expect(canAccessFinalizedReceipt("processing", "successful")).toBe(true);
    expect(canAccessFinalizedReceipt("pending", "successful")).toBe(false);
    expect(canAccessFinalizedReceipt("paid", "pending")).toBe(false);
    expect(() =>
      buildReceiptDocument(
        finalizedRecord({ order: { ...finalizedRecord().order, status: "pending" } }),
      ),
    ).toThrow("unfinalized payment");
  });

  it("uses immutable receipt items and totals without recalculating current commerce data", () => {
    const document = buildReceiptDocument(finalizedRecord());
    expect(document.items).toEqual([
      {
        sku: "DG-MON-ZP15",
        name: "Immutable Monitor",
        quantity: 2,
        unit_price: 25_000,
        line_total: 50_000,
      },
    ]);
    expect(document).toMatchObject({
      subtotal: 50_000,
      discount: 500,
      delivery_fee: 10_005,
      total: 59_505,
      payment_status: "PAID",
    });
  });

  it("uses the shipping snapshot name instead of substituting the customer email", () => {
    const document = buildReceiptDocument(finalizedRecord());
    expect(document.customer_name).toBe("Ada Lovelace");
    expect(document.customer_email).toBe("ada@example.com");
    expect(document.customer_name).not.toBe(document.customer_email);

    const withoutName = buildReceiptDocument(
      finalizedRecord({
        order: {
          ...finalizedRecord().order,
          shipping_address: { full_name: "", phone: "+2348012345678" },
        },
      }),
    );
    expect(withoutName.customer_name).toBe("Not provided");
  });

  it("loads business identity only from Settings and never paper-form fallback values", () => {
    const document = buildReceiptDocument(finalizedRecord());
    expect(document.company).toEqual({
      name: "Diplomat Global",
      tagline: "Configured subsidiary line",
      registrationNumber: "BN-CONFIGURED",
      email: "configured@example.com",
      phone: "+2348099999999",
      address: "Configured business address",
      website: "https://configured.example.com",
    });
    const html = generateReceiptHTML(document);
    expect(html).toContain("Configured business address");
    expect(html).toContain("https://configured.example.com");
    expect(html).not.toContain("No. 000400");
    expect(html).not.toContain("BN: 3049329");
  });

  it("renders free delivery explicitly from the immutable zero delivery snapshot", () => {
    const record = finalizedRecord();
    record.receipt.delivery_fee = 0;
    record.receipt.total = 49_500;
    const html = generateReceiptHTML(buildReceiptDocument(record));
    expect(html).toContain("Free Delivery");
    expect(html).toContain("PAYMENT RECEIPT");
    expect(html).toContain("Print / Save as PDF");
  });

  it("rejects inconsistent immutable item and payment totals", () => {
    const wrongTotal = finalizedRecord();
    wrongTotal.receipt.total = 7_500;
    expect(() => buildReceiptDocument(wrongTotal)).toThrow("totals are inconsistent");

    const wrongLine = finalizedRecord();
    wrongLine.receipt.items_snapshot = [
      { name: "Monitor", quantity: 2, unit_price: 25_000, line_total: 1 },
    ];
    expect(() => buildReceiptDocument(wrongLine)).toThrow("item 1 total is inconsistent");
  });

  it("escapes stored customer and product values in the generated receipt", () => {
    const record = finalizedRecord();
    record.order.shipping_address = {
      full_name: "<script>customer</script>",
      address: "<b>address</b>",
    };
    record.receipt.items_snapshot = [
      { name: "<img src=x onerror=alert(1)>", quantity: 1, unit_price: 50_000, line_total: 50_000 },
    ];
    const html = generateReceiptHTML(buildReceiptDocument(record));
    expect(html).not.toContain("<script>customer</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;customer&lt;/script&gt;");
  });

  it("is deterministic on refresh and does not mutate the immutable snapshot", () => {
    const record = finalizedRecord();
    const before = structuredClone(record);
    const document = buildReceiptDocument(record);
    expect(generateReceiptHTML(document)).toBe(generateReceiptHTML(document));
    expect(record).toEqual(before);
  });

  it("accepts only opaque UUID receipt tokens at the public boundary", () => {
    expect(isOpaqueReceiptToken("55555555-5555-4555-8555-555555555555")).toBe(true);
    expect(isOpaqueReceiptToken("1")).toBe(false);
    expect(isOpaqueReceiptToken("DG-20260904-000001")).toBe(false);
    expect(isOpaqueReceiptToken("../../../orders")).toBe(false);
  });

  it("builds the transactional receipt email from the same snapshot with its secure link", () => {
    const document = buildReceiptDocument(finalizedRecord());
    const html = paymentReceiptTemplate({
      customerName: document.customer_name,
      receiptNumber: document.receipt_number,
      orderReference: document.order_reference,
      paystackReference: document.payment_reference,
      items: document.items,
      subtotal: document.subtotal,
      discount: document.discount,
      delivery_fee: document.delivery_fee,
      total: document.total,
      paymentDate: document.payment_date,
      receiptUrl: `https://example.test/api/receipt/${document.receipt_token}`,
      company: document.company,
    });
    expect(html).toContain("Immutable Monitor");
    expect(html).toContain("59,505");
    expect(html).toContain(document.receipt_token);
    expect(html).toContain("View / Print Receipt");
    expect(html).toContain("Configured business address");
    expect(html).toContain("https://configured.example.com");
  });
});
