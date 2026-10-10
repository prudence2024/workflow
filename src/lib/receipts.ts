import { canonicalPlanKey, PLANS, type PlanKey } from "@/lib/plans";

export type ReceiptStatus = "PAID" | "VERIFIED";

export type ReceiptData = {
  id: string;
  receiptNumber: string;
  transactionReference: string;
  providerTransactionId: string | null;
  customerName: string;
  customerEmail: string;
  workspaceName: string;
  planKey: PlanKey;
  planName: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  amountMinor: number;
  amount: string;
  currency: string;
  status: ReceiptStatus;
  paymentMethod: string | null;
  paidAt: string;
  provider: string;
};

export type ReceiptPaymentInput = {
  id: string;
  receipt_number: string | null;
  provider_reference: string;
  provider_transaction_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  workspace_name: string;
  plan_key: string;
  amount: number;
  currency: string;
  status: string;
  payment_method_summary: string | null;
  billing_period_start: Date | string | null;
  billing_period_end: Date | string | null;
  paid_at: Date | string | null;
  provider: string;
};

export function receiptDataFromPayment(payment: ReceiptPaymentInput): ReceiptData {
  if (payment.status !== "verified" || !payment.paid_at) {
    throw new Error("Only verified payments can produce receipts");
  }
  const planKey = canonicalPlanKey(payment.plan_key);
  const paidAt = new Date(payment.paid_at).toISOString();
  return {
    id: payment.id,
    receiptNumber: payment.receipt_number ?? `WF-${payment.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    transactionReference: payment.provider_reference,
    providerTransactionId: payment.provider_transaction_id,
    customerName: payment.customer_name ?? "Workflow customer",
    customerEmail: payment.customer_email ?? "—",
    workspaceName: payment.workspace_name,
    planKey,
    planName: PLANS[planKey].name,
    billingPeriodStart: payment.billing_period_start ? new Date(payment.billing_period_start).toISOString() : null,
    billingPeriodEnd: payment.billing_period_end ? new Date(payment.billing_period_end).toISOString() : null,
    amountMinor: payment.amount,
    amount: formatReceiptAmount(payment.amount, payment.currency),
    currency: payment.currency.toUpperCase(),
    status: "PAID",
    paymentMethod: payment.payment_method_summary,
    paidAt,
    provider: payment.provider,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function printable(value: string | null | undefined): string {
  return (value ?? "—").replace(/[\r\n\t]+/g, " ").trim() || "—";
}

export function formatReceiptAmount(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  if (currency.toUpperCase() === "NGN") {
    return `₦${major.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency.toUpperCase()} ${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatReceiptDate(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function receiptFilename(reference: string): string {
  const safe = reference.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `workflow-receipt-${safe || "payment"}.pdf`;
}

export function receiptRows(data: ReceiptData): Array<[string, string]> {
  return [
    ["Receipt number", data.receiptNumber],
    ["Transaction reference", data.transactionReference],
    ["Customer", data.customerName],
    ["Workspace", data.workspaceName],
    ["Plan", data.planName],
    ["Amount", data.amount],
    ["Currency", data.currency],
    ["Payment date", formatReceiptDate(data.paidAt)],
    ["Payment method", data.paymentMethod ?? "Provider verified"],
    ["Status", data.status],
  ];
}

export function buildReceiptEmail(data: ReceiptData): {
  subject: string;
  html: string;
  attachment: { filename: string; content: Uint8Array; contentType: string };
} {
  return {
    subject: `Workflow receipt ${data.receiptNumber}`,
    html: renderReceiptHtml(data, { email: true }),
    attachment: {
      filename: receiptFilename(data.transactionReference),
      content: renderReceiptPdf(data),
      contentType: "application/pdf",
    },
  };
}

/** Shared semantic receipt presentation used by the web and email renderers. */
export function renderReceiptHtml(data: ReceiptData, options?: { email?: boolean }): string {
  const rows = receiptRows(data)
    .map(([label, value]) => `<div class="receipt-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(printable(value))}</strong></div>`)
    .join("");
  const className = options?.email ? "receipt receipt-email" : "receipt";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflow receipt ${escapeHtml(data.receiptNumber)}</title>
<style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#10213d;font-family:Arial,Helvetica,sans-serif}
  .receipt{max-width:720px;margin:32px auto;padding:48px;background:#fff;border:1px solid #dbe4ef;border-radius:18px;box-shadow:0 12px 30px rgba(16,33,61,.08)}
  .receipt-brand{font-size:24px;font-weight:700;letter-spacing:-.03em}.receipt-kicker{margin-top:38px;color:#65758b;font-size:12px;text-transform:uppercase;letter-spacing:.16em;font-weight:700}
  h1{margin:8px 0 0;font-size:32px;letter-spacing:-.04em}.receipt-status{display:inline-flex;margin-top:18px;padding:7px 11px;border-radius:999px;background:#e7f8f3;color:#087d68;font-size:12px;font-weight:700;letter-spacing:.08em}
  .receipt-meta{margin-top:34px;border-top:1px solid #dbe4ef}.receipt-row{display:flex;justify-content:space-between;gap:24px;padding:13px 0;border-bottom:1px solid #e8eef5;font-size:14px}.receipt-row span{color:#65758b}.receipt-row strong{text-align:right;font-weight:600;overflow-wrap:anywhere}.receipt-total{display:flex;justify-content:space-between;gap:24px;margin-top:28px;padding-top:20px;border-top:2px solid #10213d;font-size:18px}.receipt-total strong{font-size:24px}.receipt-footer{margin-top:34px;color:#65758b;font-size:12px;line-height:1.6}
  @media print{body{background:#fff}.receipt{max-width:none;margin:0;padding:24px;border:0;box-shadow:none}.receipt-row{break-inside:avoid}}
  @media(max-width:600px){.receipt{margin:0;padding:28px 20px;border-radius:0}.receipt-row{align-items:flex-start;flex-direction:column;gap:4px}.receipt-row strong{text-align:left}.receipt-total{align-items:flex-start;flex-direction:column;gap:8px}}
</style></head><body><main class="${className}">
  <div class="receipt-brand">Workflow</div><div class="receipt-kicker">Verified payment receipt</div><h1>${escapeHtml(data.planName)} plan</h1>
  <div class="receipt-status">PAID · VERIFIED</div><section class="receipt-meta">${rows}</section>
  <div class="receipt-total"><span>Total paid</span><strong>${escapeHtml(data.amount)}</strong></div>
  <p class="receipt-footer">This receipt was generated from a server-verified ${escapeHtml(data.provider)} payment. It does not contain payment instrument details.</p>
</main></body></html>`;
}

function pdfText(value: string): string {
  return printable(value)
    .replace(/₦/g, "NGN ")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Small dependency-free PDF renderer. It intentionally uses the same
 * ReceiptData and row order as the browser/email template. The ASCII fallback
 * for the Naira glyph keeps the document valid with the built-in PDF font.
 */
export function renderReceiptPdf(data: ReceiptData): Uint8Array {
  const lines = [
    "Workflow",
    "VERIFIED PAYMENT RECEIPT",
    `${data.planName} plan`,
    "",
    ...receiptRows(data).flatMap(([label, value]) => [`${label}:`, value]),
    "",
    `Total paid: ${data.amount}`,
    "PAID - VERIFIED",
  ];
  const commands = ["BT", "/F1 18 Tf", "48 790 Td", `(${pdfText(lines[0])}) Tj`, "/F1 10 Tf", "0 -26 Td"];
  for (const line of lines.slice(1)) {
    commands.push(`(${pdfText(line)}) Tj`, "0 -18 Td");
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}
