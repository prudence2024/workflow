/**
 * Admin → Receipt table → Resend Email contract.
 *
 * The Owner-approved receipt architecture requires the manual resend to be
 * the SAME canonical email as the automatic post-payment receipt: same
 * template, same canonical PDF attachment (the Download Receipt renderer),
 * and no receipt mutation when the provider rejects the send.
 *
 * admin/server-fns serverFns run only under TanStack Start's build context,
 * so (per repo convention, cf. email-provider-chain.test.ts) the resend
 * contract is pinned by source assertions against the handler block, while
 * the renderer/template identities themselves are exercised functionally in
 * receipt-pdf.test.ts / receipt-consistency.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/admin/server-fns.ts", "utf8");

function handlerBlock(exportName: string): string {
  const start = source.indexOf(`export const ${exportName} = createServerFn`);
  expect(start, `${exportName} exists`).toBeGreaterThan(-1);
  const next = source.indexOf("export const ", start + 10);
  return source.slice(start, next === -1 ? source.length : next);
}

const resend = () => handlerBlock("adminResendReceipt");

describe("adminResendReceipt — canonical receipt email contract", () => {
  it("renders the attachment with the SAME canonical PDF renderer as Download Receipt", () => {
    const block = resend();
    expect(block).toContain('await import("@/lib/receipt-pdf")');
    expect(block).toContain("generateReceiptPdf(receipt)");
    expect(block).toContain("formatReceiptPdfFilename(receipt.receipt_number)");
    expect(block).toContain("attachments: [receiptAttachment]");
  });

  it("sends the SAME canonical template as the automatic post-payment email", () => {
    const block = resend();
    expect(block).toContain('await import("@/lib/email-templates.server")');
    expect(block).toContain("paymentReceiptTemplate({");
    // The automatic finalize path must use the identical template function.
    const finalize = readFileSync("src/lib/payment-finalize.server.ts", "utf8");
    expect(finalize).toContain("paymentReceiptTemplate({");
  });

  it("only marks the receipt emailed after the provider accepts the send", () => {
    const block = resend();
    const failureIdx = block.indexOf("if (!emailResult.sent)");
    const emailedIdx = block.indexOf('status: "emailed"');
    expect(failureIdx).toBeGreaterThan(-1);
    expect(emailedIdx).toBeGreaterThan(failureIdx);
    // Failure path records the reason instead of pretending success.
    expect(block.slice(failureIdx)).toContain("failure_reason");
  });

  it("keeps the resend working when the PDF renderer fails (attachment is best-effort)", () => {
    const block = resend();
    const attachTry = block.indexOf("let receiptAttachment");
    const catchMarker = block.indexOf("[admin-resend-receipt] PDF attachment unavailable");
    expect(attachTry).toBeGreaterThan(-1);
    expect(catchMarker).toBeGreaterThan(attachTry);
    // The sendTransactionalEmail call sits OUTSIDE the attachment try/catch.
    const sendIdx = block.indexOf("sendTransactionalEmail(");
    const catchEnd = block.indexOf("}", block.indexOf("console.error", catchMarker));
    expect(sendIdx).toBeGreaterThan(catchEnd);
  });

  it("addresses the email to the canonical receipt customer", () => {
    expect(resend()).toContain("to: receipt.customer_email");
  });
});
