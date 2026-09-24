import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildReceiptDocument,
  generateReceiptHTML,
  type ReceiptRecordInput,
} from "../src/lib/receipt-document";
import { generateReceiptPdf } from "../src/lib/receipt-pdf";
import { paymentReceiptTemplate } from "../src/lib/email-templates.server";

const RECORD: ReceiptRecordInput = {
  receipt: {
    receipt_number: "DG-20260914-000042",
    download_token: "55555555-5555-4555-8555-555555555555",
    customer_email: "test.customer@example.com",
    items_snapshot: [
      { sku: "DG-X1", name: "Widget", quantity: 1, unit_price: 69_000, line_total: 69_000 },
    ],
    subtotal: 69_000,
    discount: 0,
    delivery_fee: 0,
    total: 69_000,
    currency: "NGN",
    created_at: "2026-09-14T09:30:00.000Z",
  },
  order: {
    reference: "DG-ORDER-FREE",
    status: "paid",
    email: "proof@example.test",
    shipping_address: {
      full_name: "Proof Customer",
      phone: "+2348091112222",
      address: "1 Proof Lane",
      city: "Yaba",
      lga: "Yaba",
      state: "Lagos",
    },
    payment_reference: "DG-PAY-FREE",
  },
  transaction: {
    reference: "DG-PAY-FREE",
    paystack_reference: "psx_proof_free",
    status: "successful",
    channel: "card",
    paid_at: "2026-09-14T09:29:40.000Z",
  },
  settings: {
    company_name: "Diplomat Global",
    bn_number: "BN-42",
    support_email: "configured@example.com",
    phone: "+2348090000000",
    location: "Lagos, Nigeria",
    website_url: "https://configured.example.com",
  },
};

mkdirSync("email-qa", { recursive: true });
const doc = buildReceiptDocument(RECORD);
const pdf = generateReceiptPdf(doc);
writeFileSync("email-qa/receipt.pdf", pdf);

const html = generateReceiptHTML(doc);
const email = paymentReceiptTemplate({
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
writeFileSync("email-qa/receipt-email.html", email);

const imgCount = (s: string) => (s.match(/<img/g) ?? []).length;
console.log(`PDF_BYTES=${pdf.length}`);
console.log(`PDF_SHA256_HEAD=${createHash("sha256").update(pdf).digest("hex").slice(0, 16)}…`);
console.log(`ATTACHMENT_MIME=application/pdf`);
console.log(`EMAIL_IMAGES_DISABLED_SAFE=${imgCount(email) === 0 ? "YES (zero <img> tags)" : "NO"}`);
console.log(`HTML_FREE_LINE=${/Free/i.test(html) ? "PRESENT" : "MISSING"}`);
console.log(`EMAIL_FREE_LINE=${/Free/i.test(email) ? "PRESENT" : "MISSING"}`);
