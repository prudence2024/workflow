import "@tanstack/react-start/server-only";
import { BUSINESS_ADDRESS } from "@/lib/constants";

/** Escape HTML special characters to prevent injection in email templates */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COMPANY = {
  name: "Diplomat Global Tech-Solutions",
  email: "support@diplomatglobal.com",
  phone: "+234 803 575 1338",
  location: BUSINESS_ADDRESS,
  url: "https://diplomatglobal.vercel.app",
};

type EmailBusinessIdentity = {
  name: string;
  tagline?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};

function baseTemplate(
  content: string,
  preheader?: string,
  business?: EmailBusinessIdentity,
): string {
  const identity = business ?? {
    name: COMPANY.name,
    tagline: "Premium Electronics & Tech in Nigeria",
    email: COMPANY.email,
    phone: COMPANY.phone,
    address: COMPANY.location,
    website: COMPANY.url,
  };
  const footerDetails = [identity.email, identity.phone, identity.address, identity.website]
    .filter(Boolean)
    .map((value) => `<p style="margin:3px 0;">${escapeHtml(value || "")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;color:#333;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ""}
<div style="max-width:600px;margin:0 auto;padding:20px;width:100%;box-sizing:border-box;">
<div style="background:linear-gradient(135deg,#0a0a0c,#1a1a2e);color:#fff;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
<h1 style="margin:0;font-size:18px;letter-spacing:-0.02em;">${escapeHtml(identity.name)}</h1>
${identity.tagline ? `<p style="margin:4px 0 0;font-size:12px;opacity:0.7;">${escapeHtml(identity.tagline)}</p>` : ""}
</div>
<div style="background:#fff;padding:24px 32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
${content}
</div>
<div style="text-align:center;padding:16px;font-size:12px;color:#666;">
<p style="margin:3px 0;font-weight:600;">${escapeHtml(identity.name)}</p>
${footerDetails}
</div>
</div></body></html>`;
}

// ── Templates ──

export function orderConfirmationTemplate(input: {
  customerName: string;
  orderReference: string;
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  total: number;
}): string {
  const itemsHTML = input.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;">${escapeHtml(i.name)}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:center;">${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;">₦${i.unit_price.toLocaleString("en-NG")}</td></tr>`,
    )
    .join("");

  return baseTemplate(
    `<h2 style="margin:0 0 4px;font-size:20px;">Order Confirmed ✅</h2>
<p style="margin:0 0 16px;color:#666;font-size:14px;">Thank you, ${escapeHtml(input.customerName)}! Your order has been received.</p>
<div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
<p style="margin:0;font-size:13px;color:#666;">Order Reference</p>
<p style="margin:4px 0 0;font-size:16px;font-weight:600;">${input.orderReference}</p>
</div>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<tr><th style="text-align:left;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;">Item</th><th style="text-align:center;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;">Qty</th><th style="text-align:right;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;">Price</th></tr>
${itemsHTML}
</table>
<div style="border-top:2px solid #0a0a0c;padding-top:12px;margin-top:8px;">
<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;">
<span>Total</span><span>₦${input.total.toLocaleString("en-NG")}</span>
</div>
</div>
<p style="margin:20px 0 0;font-size:13px;color:#666;">You will receive a payment receipt and shipping updates via email.</p>`,
    `Order ${input.orderReference} confirmed — ₦${input.total.toLocaleString("en-NG")}`,
  );
}

export function paymentReceiptTemplate(input: {
  customerName: string;
  receiptNumber: string;
  orderReference: string;
  paystackReference?: string;
  items: Array<{ name: string; quantity: number; line_total: number }>;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  paymentDate: string;
  receiptUrl?: string;
  company?: EmailBusinessIdentity;
}): string {
  const money = (value: number) => `₦${value.toLocaleString("en-NG")}`;
  const subject = input.receiptNumber
    ? `Receipt ${input.receiptNumber} — ${money(input.total)}`
    : `Payment Receipt — Order ${input.orderReference} — ${money(input.total)}`;
  return baseTemplate(paymentReceiptContent(input), subject, input.company);
}

/**
 * The ONE canonical receipt email body, shared by BOTH the automatic
 * post-payment email and Admin → Receipt table → Resend Email so the two are
 * structurally identical by construction. `receiptNumber` renders only when
 * present; Delivery shows the literal "Free" at ₦0 (accounting stays numeric 0).
 */
export function paymentReceiptContent(input: {
  customerName: string;
  receiptNumber: string;
  orderReference: string;
  paystackReference?: string;
  items: Array<{ name: string; quantity: number; line_total: number }>;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  paymentDate: string;
  receiptUrl?: string;
  company?: EmailBusinessIdentity;
}): string {
  const money = (value: number) => `₦${value.toLocaleString("en-NG")}`;
  const itemsHTML = input.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;word-break:break-word;">${escapeHtml(i.name)}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:center;white-space:nowrap;">${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;white-space:nowrap;">${money(i.line_total)}</td></tr>`,
    )
    .join("");

  // Email-safe meta rows: several mobile clients ignore flexbox, which lets
  // long references force the card wider than the viewport and clip values.
  // A fixed-layout table with word-break wraps instead of overflowing.
  const metaRow = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;font-size:13px;color:#666;width:45%;">${label}</td><td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right;word-break:break-all;">${value}</td></tr>`;
  const receiptNumberRow = input.receiptNumber
    ? metaRow("Receipt Number", escapeHtml(input.receiptNumber))
    : "";
  const paystackRow = input.paystackReference
    ? metaRow("Payment Ref", escapeHtml(input.paystackReference))
    : "";
  const metaTable =
    receiptNumberRow || paystackRow
      ? `<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin:16px 0;table-layout:fixed;"><tbody>${receiptNumberRow}<tr>${`<td style="padding:4px 0;font-size:13px;color:#666;width:45%;">Order Reference</td><td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right;word-break:break-all;">${input.orderReference}</td>`}</tr>${paystackRow}<tr><td style="padding:4px 0;font-size:13px;color:#666;width:45%;">Date</td><td style="padding:4px 0;font-size:13px;text-align:right;">${new Date(input.paymentDate).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</td></tr></tbody></table>`
      : "";

  return `<h2 style="margin:0 0 4px;font-size:20px;">Payment Receipt 🧾</h2>
<p style="margin:0 0 16px;color:#666;font-size:14px;">Hello ${escapeHtml(input.customerName)}, your payment has been confirmed.</p>
<div style="background:#d1fae5;border-radius:8px;padding:12px 16px;margin:16px 0;text-align:center;">
<span style="color:#065f46;font-weight:600;font-size:14px;">✅ Payment Successful</span>
</div>
${metaTable}
<table style="width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed;">
<tr><th style="text-align:left;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;width:58%;">Item</th><th style="text-align:center;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;width:12%;">Qty</th><th style="text-align:right;font-size:11px;text-transform:uppercase;color:#666;padding:8px 0;border-bottom:2px solid #eee;width:30%;">Amount</th></tr>
${itemsHTML}
</table>
<table style="width:100%;border-collapse:collapse;border-top:2px solid #0a0a0c;padding-top:12px;margin-top:8px;table-layout:fixed;">
<tr><td style="font-size:13px;padding:4px 0;">Subtotal</td><td style="font-size:13px;padding:4px 0;text-align:right;white-space:nowrap;">${money(input.subtotal)}</td></tr>
${input.discount > 0 ? `<tr><td style="font-size:13px;padding:4px 0;">Discount</td><td style="font-size:13px;padding:4px 0;text-align:right;white-space:nowrap;">-${money(input.discount)}</td></tr>` : ""}
<tr><td style="font-size:13px;padding:4px 0;">Delivery</td><td style="font-size:13px;padding:4px 0;text-align:right;white-space:nowrap;">${input.delivery_fee > 0 ? money(input.delivery_fee) : "Free"}</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding:12px 0 0;border-top:1px solid #eee;">Total</td><td style="font-size:18px;font-weight:700;padding:12px 0 0;border-top:1px solid #eee;text-align:right;white-space:nowrap;">${money(input.total)}</td></tr>
</table>
${input.receiptUrl ? `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(input.receiptUrl)}" style="display:inline-block;background:#075ea8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View / Print Receipt</a></p>` : ""}`;
}

export function adminOrderNotificationTemplate(input: {
  orderReference: string;
  customerEmail: string;
  total: number;
  itemCount: number;
}): string {
  return baseTemplate(
    `<h2 style="margin:0 0 4px;font-size:18px;">New Order Received 🛒</h2>
<p style="margin:0 0 16px;color:#666;font-size:14px;">A new order has been placed on your store.</p>
<div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
<div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0;"><span style="color:#666;">Order</span><span style="font-weight:600;">${input.orderReference}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0;"><span style="color:#666;">Customer</span><span>${escapeHtml(input.customerEmail)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0;"><span style="color:#666;">Items</span><span>${input.itemCount}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0;"><span style="color:#666;">Total</span><span style="font-weight:700;">₦${input.total.toLocaleString("en-NG")}</span></div>
</div>
<a href="${COMPANY.url}/dashboard/orders" style="display:inline-block;background:#0a0a0c;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">View in Dashboard</a>`,
    `New order ${input.orderReference} — ₦${input.total.toLocaleString("en-NG")}`,
  );
}
