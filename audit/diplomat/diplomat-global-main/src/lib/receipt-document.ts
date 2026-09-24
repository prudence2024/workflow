export const FINALIZED_ORDER_STATUSES = new Set(["paid", "processing", "shipped", "delivered"]);
const OPAQUE_RECEIPT_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReceiptItemSnapshot {
  sku?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptBusinessIdentity {
  name: string;
  tagline: string;
  registrationNumber: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

export interface ReceiptDocumentData {
  receipt_token: string;
  receipt_number: string;
  receipt_date: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  order_reference: string;
  payment_reference: string;
  payment_method: string;
  items: ReceiptItemSnapshot[];
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  currency: string;
  payment_status: "PAID";
  payment_date: string;
  company: ReceiptBusinessIdentity;
}

export interface ReceiptRecordInput {
  receipt: {
    receipt_number: string;
    download_token: string;
    customer_email: string;
    items_snapshot: unknown;
    subtotal: unknown;
    discount: unknown;
    delivery_fee: unknown;
    total: unknown;
    currency?: string | null;
    created_at: string;
  };
  order: {
    reference: string;
    status: string;
    email?: string | null;
    shipping_address?: unknown;
    payment_reference?: string | null;
  };
  transaction: {
    reference: string;
    paystack_reference?: string | null;
    status: string;
    channel?: string | null;
    paid_at?: string | null;
  };
  settings: Record<string, string>;
}

type ShippingSnapshot = {
  full_name?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
  lga?: unknown;
  state?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteMoney(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid immutable receipt ${field}`);
  }
  return number;
}

function parseItems(value: unknown): ReceiptItemSnapshot[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Immutable receipt items are unavailable");
  }
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Invalid receipt item ${index + 1}`);
    const item = raw as Record<string, unknown>;
    const name = cleanText(item.name);
    const quantity = Number(item.quantity);
    const unitPrice = finiteMoney(item.unit_price, "unit price");
    const lineTotal = finiteMoney(item.line_total, "line total");
    if (!name || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Invalid receipt item ${index + 1}`);
    }
    if (Math.abs(unitPrice * quantity - lineTotal) > 0.005) {
      throw new Error(`Receipt item ${index + 1} total is inconsistent`);
    }
    return {
      name,
      sku: cleanText(item.sku) || null,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });
}

export function canAccessFinalizedReceipt(orderStatus: string, transactionStatus: string): boolean {
  return FINALIZED_ORDER_STATUSES.has(orderStatus) && transactionStatus === "successful";
}

export function isOpaqueReceiptToken(value: string): boolean {
  return OPAQUE_RECEIPT_TOKEN.test(value);
}

export function formatShippingAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "Not provided";
  const shipping = value as ShippingSnapshot;
  const seen = new Set<string>();
  const parts = [shipping.address, shipping.city, shipping.lga, shipping.state]
    .map(cleanText)
    .filter((part) => {
      if (!part) return false;
      const key = part.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return parts.join(", ") || "Not provided";
}

export function buildReceiptDocument(input: ReceiptRecordInput): ReceiptDocumentData {
  if (!canAccessFinalizedReceipt(input.order.status, input.transaction.status)) {
    throw new Error("Receipt is not available for an unfinalized payment");
  }

  const shipping =
    input.order.shipping_address && typeof input.order.shipping_address === "object"
      ? (input.order.shipping_address as ShippingSnapshot)
      : {};
  const subtotal = finiteMoney(input.receipt.subtotal, "subtotal");
  const discount = finiteMoney(input.receipt.discount, "discount");
  const deliveryFee = finiteMoney(input.receipt.delivery_fee, "delivery fee");
  const total = finiteMoney(input.receipt.total, "total");
  if (
    discount > subtotal ||
    Math.abs(Math.max(0, subtotal - discount) + deliveryFee - total) > 0.005
  ) {
    throw new Error("Immutable receipt totals are inconsistent");
  }

  const channel = cleanText(input.transaction.channel);
  const companyName = cleanText(input.settings.company_name) || "Diplomat Global";

  return {
    receipt_token: cleanText(input.receipt.download_token),
    receipt_number: cleanText(input.receipt.receipt_number),
    receipt_date: input.receipt.created_at,
    customer_name: cleanText(shipping.full_name) || "Not provided",
    customer_email: cleanText(input.receipt.customer_email || input.order.email) || "Not provided",
    customer_phone: cleanText(shipping.phone) || "Not provided",
    delivery_address: formatShippingAddress(shipping),
    order_reference: cleanText(input.order.reference),
    payment_reference:
      cleanText(input.transaction.paystack_reference) ||
      cleanText(input.transaction.reference) ||
      cleanText(input.order.payment_reference),
    payment_method: channel ? `Paystack · ${channel}` : "Paystack",
    items: parseItems(input.receipt.items_snapshot),
    subtotal,
    discount,
    delivery_fee: deliveryFee,
    total,
    currency: cleanText(input.receipt.currency) || "NGN",
    payment_status: "PAID",
    payment_date: input.transaction.paid_at || input.receipt.created_at,
    company: {
      name: companyName,
      tagline: cleanText(input.settings.tagline),
      registrationNumber: cleanText(input.settings.bn_number),
      email: cleanText(input.settings.support_email),
      phone: cleanText(input.settings.phone),
      address: cleanText(input.settings.location),
      website: cleanText(input.settings.website_url),
    },
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function generateReceiptHTML(data: ReceiptDocumentData): string {
  const e = escapeHtml;
  const money = (amount: number) => e(formatCurrency(amount, data.currency));
  const businessContact = [
    data.company.address,
    data.company.email,
    data.company.phone,
    data.company.website,
  ]
    .filter(Boolean)
    .map((value) => `<span>${e(value)}</span>`)
    .join("");
  const itemRows = data.items
    .map(
      (item) => `<tr>
        <td data-label="Qty" class="qty">${item.quantity}</td>
        <td data-label="Product" class="product"><strong>${e(item.name)}</strong>${item.sku ? `<small>SKU: ${e(item.sku)}</small>` : ""}</td>
        <td data-label="Unit Price" class="money">${money(item.unit_price)}</td>
        <td data-label="Amount" class="money line-total">${money(item.line_total)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Payment Receipt ${e(data.receipt_number)}</title>
  <style>
    :root { color-scheme: light; --blue:#075ea8; --navy:#082d52; --sky:#eaf5ff; --line:#c9d8e6; --ink:#10273d; --muted:#5d7185; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-width:0; background:#eef4f9; color:var(--ink); font-family:Inter,"Segoe UI",Arial,sans-serif; }
    body { padding:24px; overflow-x:hidden; }
    .receipt { width:min(100%, 900px); margin:0 auto; overflow:hidden; border:1px solid #d9e4ee; border-radius:20px; background:#fff; box-shadow:0 18px 55px rgba(8,45,82,.12); }
    .accent { height:8px; background:linear-gradient(90deg,var(--navy),var(--blue),#3ca7dc); }
    .header { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(220px,.75fr); gap:30px; padding:34px 38px 28px; background:linear-gradient(140deg,#fff 0%,#f7fbff 72%,#e9f5ff 100%); }
    .brand { display:flex; min-width:0; gap:16px; align-items:flex-start; }
    .logo { display:grid; place-items:center; flex:0 0 66px; width:66px; height:66px; overflow:hidden; border-radius:16px; background:var(--navy); box-shadow:0 8px 20px rgba(8,45,82,.18); }
    .logo img { display:block; width:54px; height:54px; object-fit:contain; }
    .identity { min-width:0; }
    .identity h1 { margin:1px 0 5px; color:var(--navy); font-size:clamp(20px,3vw,28px); line-height:1.08; letter-spacing:-.03em; overflow-wrap:anywhere; }
    .tagline { margin:0 0 9px; color:var(--blue); font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .registration { display:inline-block; margin-bottom:9px; padding:4px 9px; border:1px solid #aac9e3; border-radius:999px; color:var(--navy); font-size:11px; font-weight:700; }
    .business-contact { display:flex; flex-direction:column; gap:3px; color:var(--muted); font-size:12px; line-height:1.45; overflow-wrap:anywhere; }
    .business-contact span { white-space:pre-line; }
    .document-title { text-align:right; }
    .document-title p { margin:0 0 4px; color:var(--blue); font-size:11px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .document-title h2 { margin:0; color:var(--navy); font-size:30px; line-height:1; letter-spacing:-.04em; }
    .paid { display:inline-flex; align-items:center; gap:7px; margin-top:15px; padding:8px 13px; border-radius:999px; background:#e5f7ec; color:#14723a; font-size:12px; font-weight:800; letter-spacing:.08em; }
    .paid::before { content:""; width:8px; height:8px; border-radius:50%; background:#20a45a; }
    .meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); border-block:1px solid var(--line); background:var(--sky); }
    .meta div { min-width:0; padding:15px 22px; border-right:1px solid var(--line); }
    .meta div:last-child { border-right:0; }
    dt { margin:0 0 4px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
    dd { margin:0; color:var(--navy); font-size:13px; font-weight:700; overflow-wrap:anywhere; }
    .content { padding:30px 38px 34px; }
    .section-heading { margin:0 0 13px; color:var(--blue); font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
    .customer { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px 28px; margin-bottom:30px; padding:20px; border:1px solid var(--line); border-radius:14px; background:#fbfdff; }
    .customer .wide { grid-column:1/-1; }
    .items-wrap { min-width:0; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    thead { background:var(--navy); color:#fff; }
    th { padding:11px 13px; font-size:10px; letter-spacing:.08em; text-align:left; text-transform:uppercase; }
    th:first-child { width:64px; text-align:center; }
    th:nth-child(3), th:nth-child(4) { width:142px; text-align:right; }
    td { padding:14px 13px; border-bottom:1px solid #e4edf5; vertical-align:top; font-size:13px; overflow-wrap:anywhere; }
    td.qty { text-align:center; font-weight:700; }
    td.money { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    td.product strong { display:block; color:var(--navy); }
    td.product small { display:block; margin-top:4px; color:var(--muted); font-size:10px; }
    .summary-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(270px,330px); gap:30px; align-items:start; margin-top:28px; }
    .payment-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; padding:18px; border:1px solid var(--line); border-radius:14px; }
    .totals { break-inside:avoid; padding:19px 20px; border-radius:14px; background:var(--sky); }
    .total-line { display:flex; justify-content:space-between; gap:20px; padding:5px 0; color:var(--muted); font-size:13px; }
    .total-line span:last-child { color:var(--ink); font-weight:700; white-space:nowrap; }
    .free { margin:-1px 0 6px; color:#14723a; font-size:10px; font-weight:800; letter-spacing:.08em; text-align:right; text-transform:uppercase; }
    .grand { margin-top:9px; padding-top:12px; border-top:2px solid var(--blue); color:var(--navy); font-size:18px; font-weight:800; }
    .grand span:last-child { color:var(--blue); }
    .closing { margin:30px 0 0; padding:21px 24px; border-left:5px solid var(--blue); background:#f6faff; }
    .closing strong { display:block; margin-bottom:4px; color:var(--navy); font-size:17px; }
    .closing span { color:var(--muted); font-size:12px; }
    .actions { display:flex; justify-content:center; padding:18px 24px 28px; }
    .actions button { min-height:46px; padding:0 22px; border:0; border-radius:12px; background:var(--blue); color:#fff; font:700 14px inherit; cursor:pointer; }
    @media (max-width:640px) {
      body { padding:0; background:#fff; }
      .receipt { border:0; border-radius:0; box-shadow:none; }
      .header { grid-template-columns:1fr; gap:24px; padding:24px 18px; }
      .logo { flex-basis:56px; width:56px; height:56px; }
      .logo img { width:46px; height:46px; }
      .document-title { text-align:left; padding-left:72px; }
      .document-title h2 { font-size:25px; }
      .meta { grid-template-columns:1fr; }
      .meta div { padding:12px 18px; border-right:0; border-bottom:1px solid var(--line); }
      .meta div:last-child { border-bottom:0; }
      .content { padding:24px 16px 28px; }
      .customer { grid-template-columns:1fr; gap:13px; padding:16px; }
      .customer .wide { grid-column:auto; }
      table, tbody, tr, td { display:block; width:100%; }
      thead { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
      tbody { display:grid; gap:12px; }
      tr { padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:#fff; }
      td { display:grid; grid-template-columns:88px minmax(0,1fr); gap:12px; padding:6px 0; border:0; text-align:left !important; white-space:normal !important; }
      td::before { content:attr(data-label); color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
      td.line-total { margin-top:4px; padding-top:10px; border-top:1px solid #e4edf5; }
      .summary-grid { grid-template-columns:1fr; gap:18px; }
      .payment-details { grid-template-columns:1fr; }
      .actions { padding-inline:16px; }
      .actions button { width:100%; }
    }
    @page { size:A4; margin:12mm; }
    @media print {
      html, body { background:#fff; }
      body { padding:0; overflow:visible; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      .receipt { width:100%; max-width:none; border:0; border-radius:0; box-shadow:none; overflow:visible; }
      .header { padding:22px 26px 18px; }
      .content { padding:22px 26px 26px; }
      .customer { break-inside:avoid; }
      thead { display:table-header-group; position:static; width:auto; height:auto; overflow:visible; clip:auto; white-space:normal; }
      table { display:table; table-layout:fixed; }
      tbody { display:table-row-group; }
      tr { display:table-row; break-inside:avoid; padding:0; border:0; }
      th, td { display:table-cell; width:auto; padding:9px 10px; border-bottom:1px solid #dce6ef; }
      td::before { content:none; }
      td.qty { text-align:center !important; }
      td.money { text-align:right !important; white-space:nowrap !important; }
      .summary-grid { grid-template-columns:minmax(0,1fr) 310px; break-inside:avoid; }
      .closing { break-inside:avoid; }
      .actions { display:none !important; }
    }
  </style>
</head>
<body>
  <main class="receipt" aria-label="Payment receipt">
    <div class="accent"></div>
    <header class="header">
      <div class="brand">
        <div class="logo"><img src="/logo-192.png" alt="Diplomat Global logo"></div>
        <div class="identity">
          <h1>${e(data.company.name)}</h1>
          ${data.company.tagline ? `<p class="tagline">${e(data.company.tagline)}</p>` : ""}
          ${data.company.registrationNumber ? `<div class="registration">BN: ${e(data.company.registrationNumber)}</div>` : ""}
          <div class="business-contact">${businessContact || "<span>Business contact details are not configured.</span>"}</div>
        </div>
      </div>
      <div class="document-title">
        <p>Official digital document</p>
        <h2>PAYMENT RECEIPT</h2>
        <div class="paid">${e(data.payment_status)}</div>
      </div>
    </header>

    <dl class="meta">
      <div><dt>Receipt Number</dt><dd>${e(data.receipt_number)}</dd></div>
      <div><dt>Receipt Date</dt><dd>${e(formatDate(data.receipt_date))}</dd></div>
      <div><dt>Order ID / Reference</dt><dd>${e(data.order_reference)}</dd></div>
    </dl>

    <div class="content">
      <section aria-labelledby="customer-heading">
        <h3 class="section-heading" id="customer-heading">Customer information</h3>
        <dl class="customer">
          <div><dt>Name</dt><dd>${e(data.customer_name)}</dd></div>
          <div><dt>Email</dt><dd>${e(data.customer_email)}</dd></div>
          <div><dt>Phone</dt><dd>${e(data.customer_phone)}</dd></div>
          <div class="wide"><dt>Delivery Address</dt><dd>${e(data.delivery_address)}</dd></div>
        </dl>
      </section>

      <section class="items-wrap" aria-labelledby="items-heading">
        <h3 class="section-heading" id="items-heading">Description of goods</h3>
        <table>
          <thead><tr><th>Qty</th><th>Product</th><th>Unit Price</th><th>Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </section>

      <div class="summary-grid">
        <section aria-labelledby="payment-heading">
          <h3 class="section-heading" id="payment-heading">Payment details</h3>
          <dl class="payment-details">
            <div><dt>Payment Method</dt><dd>${e(data.payment_method)}</dd></div>
            <div><dt>Payment Status</dt><dd>${e(data.payment_status)}</dd></div>
            <div><dt>Payment Reference</dt><dd>${e(data.payment_reference)}</dd></div>
            <div><dt>Currency</dt><dd>${e(data.currency)}</dd></div>
            <div><dt>Payment Date / Time</dt><dd>${e(formatDate(data.payment_date, true))}</dd></div>
            <div><dt>Order ID</dt><dd>${e(data.order_reference)}</dd></div>
          </dl>
        </section>
        <section class="totals" aria-label="Payment totals">
          <div class="total-line"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
          <div class="total-line"><span>Coupon / Discount</span><span>-${money(data.discount)}</span></div>
          <div class="total-line"><span>Delivery</span><span>${data.delivery_fee === 0 ? "Free" : money(data.delivery_fee)}</span></div>
          ${data.delivery_fee === 0 ? '<div class="free">Free Delivery</div>' : ""}
          <div class="total-line grand"><span>Total Paid</span><span>${money(data.total)}</span></div>
        </section>
      </div>

      <div class="closing"><strong>Thank you for your patronage.</strong><span>Keep this receipt as proof of payment.</span></div>
    </div>
  </main>
  <div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
</body>
</html>`;
}
