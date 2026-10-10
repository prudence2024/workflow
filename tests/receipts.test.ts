import { describe, expect, it } from "vitest";
import { receiptDataFromPayment, receiptFilename, renderReceiptHtml, renderReceiptPdf } from "@/lib/receipts";

const verified = {
  id: "11111111-1111-4111-8111-111111111111",
  receipt_number: "WF-111111111111",
  provider_reference: "wf-test-123/unsafe",
  provider_transaction_id: "987654",
  customer_name: "Test Customer",
  customer_email: "test@example.com",
  workspace_name: "Test Workspace",
  plan_key: "pro",
  amount: 3150000,
  currency: "NGN",
  status: "verified",
  payment_method_summary: "card",
  billing_period_start: null,
  billing_period_end: null,
  paid_at: "2026-10-08T12:00:00.000Z",
  provider: "paystack",
};

describe("verified payment receipts", () => {
  it("rejects pending and failed payments", () => {
    expect(() => receiptDataFromPayment({ ...verified, status: "pending" })).toThrow("Only verified");
    expect(() => receiptDataFromPayment({ ...verified, status: "failed" })).toThrow("Only verified");
  });

  it("uses one safe data model across HTML and PDF output", () => {
    const data = receiptDataFromPayment(verified);
    const html = renderReceiptHtml(data);
    const pdf = renderReceiptPdf(data);
    expect(html).toContain("PAID · VERIFIED");
    expect(html).toContain("₦31,500.00");
    expect(new TextDecoder().decode(pdf)).toContain("NGN 31,500.00");
    expect(new TextDecoder().decode(pdf).startsWith("%PDF-1.4")).toBe(true);
  });

  it("sanitizes the reference for the download filename", () => {
    expect(receiptFilename("wf-test/123?secret=no")).toBe("workflow-receipt-wf-test-123-secret-no.pdf");
  });

  it("does not include secret or raw provider fields", () => {
    const data = receiptDataFromPayment(verified);
    expect(renderReceiptHtml(data)).not.toContain("PAYSTACK_SECRET_KEY");
    expect(renderReceiptHtml(data)).not.toContain("provider_payload");
  });
});
