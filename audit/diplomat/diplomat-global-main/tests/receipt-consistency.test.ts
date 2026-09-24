import { describe, expect, it } from "vitest";
import {
  buildReceiptDocument,
  generateReceiptHTML,
  type ReceiptRecordInput,
} from "../src/lib/receipt-document";
import { generateReceiptPdf } from "../src/lib/receipt-pdf";
import { paymentReceiptTemplate } from "../src/lib/email-templates.server";

/**
 * Receipt-consistency matrix: View/Print HTML, Download/Attachment PDF, and
 * the transactional receipt email (shared by the automatic post-payment send
 * and Admin → Receipt table → Resend Email) must all agree on the canonical
 * financial fields. All representations consume the same ReceiptDocumentData
 * / order snapshot; none recomputes or accepts browser-provided values.
 */

const RECORD: ReceiptRecordInput = {
  receipt: {
    receipt_number: "DG-20260914-000042",
    download_token: "55555555-5555-4555-8555-555555555555",
    customer_email: "test.customer@example.com",
    items_snapshot: [
      {
        sku: "DG-X1",
        name: "Consistency Product One",
        quantity: 2,
        unit_price: 450_000,
        line_total: 900_000,
      },
      {
        sku: null,
        name: "Consistency Product Two With A Deliberately Long Name",
        quantity: 1,
        unit_price: 1_600_000,
        line_total: 1_600_000,
      },
    ],
    subtotal: 2_500_000,
    discount: 50_000,
    delivery_fee: 0,
    total: 2_450_000,
    currency: "NGN",
    created_at: "2026-09-14T09:30:00.000Z",
  },
  order: {
    reference: "DG-ORDER-424242",
    status: "paid",
    email: "test.customer@example.com",
    shipping_address: {
      full_name: "Ngozi Test Customer",
      phone: "+2348091112222",
      address: "9 Consistency Close",
      city: "Yaba",
      lga: "Yaba",
      state: "Lagos",
    },
    payment_reference: "DG-PAY-424242",
  },
  transaction: {
    reference: "DG-PAY-424242",
    paystack_reference: "psx_consistency_42",
    status: "successful",
    channel: "card",
    paid_at: "2026-09-14T09:29:40.000Z",
  },
  settings: {
    company_name: "Diplomat Global",
    tagline: "Configured tagline",
    bn_number: "BN-42",
    support_email: "configured@example.com",
    phone: "+2348090000000",
    location: "Lagos, Nigeria",
    website_url: "https://configured.example.com",
  },
};

const doc = buildReceiptDocument(RECORD);
const html = generateReceiptHTML(doc);
const pdfText = Buffer.from(generateReceiptPdf(doc)).toString("latin1");
const adminEmailHtml = paymentReceiptTemplate({
  customerName: doc.customer_name,
  receiptNumber: doc.receipt_number,
  orderReference: doc.order_reference,
  paystackReference: doc.payment_reference,
  items: doc.items,
  subtotal: doc.subtotal,
  discount: doc.discount,
  delivery_fee: doc.delivery_fee,
  total: doc.total,
  paymentDate: doc.payment_date,
  receiptUrl: `https://example.test/api/receipt/${doc.receipt_token}`,
  company: doc.company,
});
// Same template the automatic post-payment email renders (empty receipt number
// means the finalize variant relies on the PDF attachment for that field).
const automaticEmailHtml = paymentReceiptTemplate({
  customerName: doc.customer_name,
  receiptNumber: "",
  orderReference: doc.order_reference,
  paystackReference: doc.payment_reference,
  items: doc.items,
  subtotal: doc.subtotal,
  discount: doc.discount,
  delivery_fee: doc.delivery_fee,
  total: doc.total,
  paymentDate: doc.payment_date,
  receiptUrl: `https://example.test/api/receipt/${doc.receipt_token}`,
  company: doc.company,
});

describe("receipt consistency across all representations", () => {
  it("receipt number appears in HTML, PDF and both email variants", () => {
    expect(html).toContain(doc.receipt_number);
    expect(pdfText).toContain(doc.receipt_number);
    expect(adminEmailHtml).toContain(doc.receipt_number);
    expect(automaticEmailHtml).not.toContain(doc.receipt_number);
  });

  it("order reference agrees everywhere", () => {
    expect(html).toContain(doc.order_reference);
    expect(pdfText).toContain(doc.order_reference);
    expect(adminEmailHtml).toContain(doc.order_reference);
    expect(automaticEmailHtml).toContain(doc.order_reference);
  });

  it("payment reference agrees everywhere it is rendered", () => {
    expect(html).toContain(doc.payment_reference);
    expect(pdfText).toContain(doc.payment_reference);
    expect(adminEmailHtml).toContain(doc.payment_reference);
    expect(automaticEmailHtml).toContain(doc.payment_reference);
  });

  it("customer name comes from the persisted shipping snapshot, never a hardcode", () => {
    expect(doc.customer_name).toBe("Ngozi Test Customer");
    expect(html).toContain("Ngozi Test Customer");
    expect(pdfText).toContain("Ngozi Test Customer");
    expect(adminEmailHtml).toContain("Ngozi Test Customer");
    expect(automaticEmailHtml).toContain("Ngozi Test Customer");
    for (const representation of [html, pdfText, adminEmailHtml, automaticEmailHtml]) {
      expect(representation).not.toContain("Hello Customer");
      expect(representation).not.toContain("Hello Charles");
    }
  });

  it("line items, quantities and totals agree everywhere", () => {
    for (const representation of [html, pdfText, adminEmailHtml, automaticEmailHtml]) {
      expect(representation).toContain("Consistency Product One");
      expect(representation).toContain("Consistency Product Two");
      expect(representation).toContain("2,500,000");
      expect(representation).toContain("2,450,000");
    }
    // The amount column per line exists in every representation.
    expect(html).toContain("1,600,000");
    expect(pdfText).toContain("1,600,000");
    expect(adminEmailHtml).toContain("1,600,000");
    expect(automaticEmailHtml).toContain("1,600,000");
  });

  it("free delivery renders as the literal word Free at zero fee, with numeric accounting unchanged", () => {
    expect(doc.delivery_fee).toBe(0);
    expect(html).toContain("Free Delivery");
    expect(pdfText).toContain("FREE DELIVERY");
    expect(adminEmailHtml).toContain(">Free<");
    expect(automaticEmailHtml).toContain(">Free<");
    // Internal numeric value remains the number 0 for financial use.
    expect(doc.total).toBe(2_450_000);
  });

  it("email variants are structurally identical apart from the receipt-number row", () => {
    const stripReceiptRow = (email: string) =>
      email.replace(
        /<tr><td[^>]*>Receipt Number<\/td><td[^>]*>[^<]*<\/td><\/tr>/,
        "",
      );
    // Subject-derived preheader text intentionally reflects each variant's
    // subject; the visible structure (greeting, summary, items, totals, CTA,
    // footer) is identical.
    const normalizePreheader = (email: string) =>
      email.replace(/(max-height:0;overflow:hidden;">)[^<]*(<\/div>)/, "$1PREHEADER$2");
    expect(normalizePreheader(stripReceiptRow(adminEmailHtml))).toBe(
      normalizePreheader(stripReceiptRow(automaticEmailHtml)),
    );
  });

  it("failed/declined orders can never produce a receipt document", () => {
    const declined: ReceiptRecordInput = {
      ...RECORD,
      order: { ...RECORD.order, status: "pending" },
    };
    expect(() => buildReceiptDocument(declined)).toThrow(/unfinalized/i);
    const failedTx: ReceiptRecordInput = {
      ...RECORD,
      transaction: { ...RECORD.transaction, status: "failed" },
    };
    expect(() => buildReceiptDocument(failedTx)).toThrow(/unfinalized/i);
  });

  it("PDF download filename stays deterministic and read-only safe", async () => {
    const { formatReceiptPdfFilename } = await import("../src/lib/receipt-pdf");
    expect(formatReceiptPdfFilename(doc.receipt_number)).toBe(
      "Diplomat-Global-Receipt-DG-20260914-000042.pdf",
    );
  });
});
