import { describe, expect, it } from "vitest";
import { formatReceiptPdfFilename, generateReceiptPdf } from "../src/lib/receipt-pdf";
import {
  buildReceiptDocument,
  type ReceiptDocumentData,
  type ReceiptRecordInput,
} from "../src/lib/receipt-document";

function finalizedRecord(): ReceiptRecordInput {
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
        {
          sku: null,
          name: "Naira-Safe Product ₦42 — (test) case\\",
          quantity: 1,
          unit_price: 5_000,
          line_total: 5_000,
        },
      ],
      subtotal: 55_000,
      discount: 500,
      delivery_fee: 10_005,
      total: 64_505,
      currency: "NGN",
      created_at: "2026-09-04T10:00:00.000Z",
    },
    order: {
      reference: "DG-TEST-REF-1",
      status: "paid",
      email: "ada@example.com",
      shipping_address: {
        full_name: "Ada Obi",
        phone: "+2348012345678",
        address: "12 Fitness St",
        city: "Surulere",
        lga: "Surulere",
        state: "Lagos",
      },
      payment_reference: null,
    },
    transaction: {
      reference: "DG-TEST-REF-1",
      paystack_reference: "psx_123",
      status: "successful",
      channel: "card",
      paid_at: "2026-09-04T10:05:00.000Z",
    },
    settings: {
      company_name: "Diplomat Global",
      tagline: "Tech Solutions",
      bn_number: "1234567",
      support_email: "support@example.com",
      phone: "+2348000000000",
      location: "Lagos, Nigeria",
      website_url: "https://example.com",
    },
  };
}

function documentFor(record: ReceiptRecordInput = finalizedRecord()): ReceiptDocumentData {
  return buildReceiptDocument(record);
}

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
}

describe("receipt PDF document representation", () => {
  it("produces a genuine PDF 1.4 file with correct structure", () => {
    const bytes = generateReceiptPdf(documentFor());
    const text = latin1(bytes);
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Page ");
    expect(text).toContain("/Count ");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // Cross-reference table with 10-digit offsets and an end-of-file marker.
    expect(text).toMatch(/xref\n0 \d+\n0000000000 65535 f /);
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    // Standard-14 only: no embedded font streams (zero-dependency guarantee).
    expect(text).not.toContain("/FontFile");
    expect(text).not.toContain("/Image");
  });

  it("renders the same authoritative values as the canonical receipt", () => {
    const bytes = generateReceiptPdf(documentFor());
    const text = latin1(bytes);
    expect(text).toContain("DG-20260904-000001");
    expect(text).toContain("DG-TEST-REF-1");
    expect(text).toContain("PAID");
    expect(text).toContain("Immutable Monitor");
    expect(text).toContain("NGN 64,505"); // total
    expect(text).toContain("-NGN 500"); // discount
    expect(text).toContain("NGN 10,005"); // delivery
    expect(text).toContain("Paystack \u00B7 card"); // middot is WinAnsi-legal, kept
    expect(text).toContain("Total Paid");
  });

  it("folds non-WinAnsi characters without breaking the stream", () => {
    const bytes = generateReceiptPdf(documentFor());
    const text = latin1(bytes);
    // The folded name wraps inside the product column, so assert per line.
    expect(text).toContain("Naira-Safe Product NGN 42");
    // The folded tail ends with ONE literal backslash; the PDF stream must
    // escape it as a doubled backslash.
    expect(text).toContain("case\\\\");
    expect(text).not.toContain("\\u0");
    expect(text).not.toContain("\\u1");
  });

  it("escapes PDF string metacharacters", () => {
    const bytes = generateReceiptPdf(documentFor());
    const text = latin1(bytes);
    expect(text).toContain("\\(");
    expect(text).toContain("\\)");
    expect(text).toContain("\\\\");
  });

  it("uses the required download filename pattern", () => {
    expect(formatReceiptPdfFilename("DG-20260904-000001")).toBe(
      "Diplomat-Global-Receipt-DG-20260904-000001.pdf",
    );
    expect(formatReceiptPdfFilename("bad/ref value")).toBe(
      "Diplomat-Global-Receipt-bad-ref-value.pdf",
    );
    expect(formatReceiptPdfFilename("")).toBe("Diplomat-Global-Receipt-download.pdf");
  });

  it("produces byte-identical output for identical canonical input", () => {
    const first = generateReceiptPdf(documentFor());
    const second = generateReceiptPdf(documentFor());
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
