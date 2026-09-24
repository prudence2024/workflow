/**
 * Genuine PDF receipt rendering from the canonical ReceiptDocumentData.
 *
 * This is a document representation ONLY: it never recomputes financial
 * totals. Every number is the authoritative value already validated by
 * buildReceiptDocument() (immutable receipt snapshot with a totals-consistency
 * check). No second financial record is created.
 *
 * Zero new dependencies: PDF 1.4 with the standard 14 fonts (Helvetica family,
 * WinAnsiEncoding). Text is folded to a WinAnsi-safe form because the receipt
 * font is Helvetica; the HTML receipt remains the Unicode-exact rendition.
 * Layout mirrors the approved HTML receipt: navy accent band, identity header
 * with PAID pill, meta strip, customer block, items table with navy head,
 * payment-details grid beside a totals panel, closing note, and a footer.
 */

import type { ReceiptDocumentData } from "./receipt-document";

// ─── Fonts (object keys declared in every page's /Resources) ───

const FONT_REGULAR = "F1";
const FONT_BOLD = "F2";
const FONT_ITALIC = "F3";

type PdfColor = string; // "r g b" with components in 0..1

const NAVY: PdfColor = "0.031 0.176 0.322"; // #082d52
const BLUE: PdfColor = "0.027 0.369 0.659"; // #075ea8
const SKY: PdfColor = "0.918 0.961 1"; // #eaf5ff
const LINE: PdfColor = "0.788 0.847 0.902"; // #c9d8e6
const MUTED: PdfColor = "0.365 0.443 0.522"; // #5d7185
const WHITE: PdfColor = "1 1 1";
const GREEN: PdfColor = "0.078 0.447 0.227"; // #14723a
const GREEN_BG: PdfColor = "0.898 0.969 0.925"; // #e5f7ec
const ROW_RULE: PdfColor = "0.894 0.929 0.961"; // #e4edf5
const CLOSING_BG: PdfColor = "0.965 0.98 1"; // #f6faff
const INK: PdfColor = "0.063 0.153 0.239"; // #10273d

// ─── Geometry (A4 portrait) ───

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 34;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_BAND_HEIGHT = 8;
/** Content must stay above this line; the footer strip lives below it. */
const CONTENT_BOTTOM = 52;

// ─── Text folding / escaping / metrics ───

/**
 * The standard-14 Helvetica fonts cover WinAnsi only, so fold the Unicode
 * receipt text into that range. Naira amounts render as "NGN 1,234" — the
 * same convention used in the plain-text email body.
 */
function winAnsiFold(value: string): string {
  return value
    .replace(/₦/g, "NGN ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function pdfEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]+/g, " ");
}

/**
 * Conservative Helvetica advance estimate used only for wrapping and right
 * alignment (never for rendering). Caps text safely inside its column.
 */
function estimateTextWidth(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? 0.55 : 0.5);
}

function wrapPlaintext(text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (estimateTextWidth(candidate, size, bold) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// ─── Content-stream primitives ───

class PdfPage {
  readonly ops: string[] = [];

  text(value: string, x: number, y: number, font: string, size: number, color: PdfColor): void {
    this.ops.push(
      `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(winAnsiFold(value))}) Tj ET`,
    );
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill?: PdfColor,
    stroke?: PdfColor,
    lineWidth = 0.75,
  ): void {
    const geometry = `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`;
    if (fill && stroke) this.ops.push(`${fill} rg ${stroke} RG ${lineWidth} w ${geometry} B`);
    else if (fill) this.ops.push(`${fill} rg ${geometry} f`);
    else if (stroke) this.ops.push(`${stroke} RG ${lineWidth} w ${geometry} S`);
  }

  rule(x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.75): void {
    this.ops.push(
      `${color} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }
}

// ─── Shared formatting ───

function formatPdfMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPdfDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

// ─── Layout ───

function buildReceiptPdfPages(data: ReceiptDocumentData): PdfPage[] {
  const pages: PdfPage[] = [];
  const addPage = (): PdfPage => {
    const next = new PdfPage();
    pages.push(next);
    return next;
  };

  let page = addPage();
  let y = PAGE_H - TOP_BAND_HEIGHT - 12;

  /** Start a new page when `needed` pt do not fit on the current one. */
  const ensure = (needed: number): void => {
    if (y - needed < CONTENT_BOTTOM) {
      page = addPage();
      y = PAGE_H - TOP_BAND_HEIGHT - 12;
    }
  };

  // ── Brand accent band (first page only; overflow pages stay clean) ──
  page.rect(0, PAGE_H - TOP_BAND_HEIGHT, PAGE_W, TOP_BAND_HEIGHT, NAVY);

  // ── Header: company identity (left) + document title / PAID pill (right) ──
  // Rows are precomputed (wrap → measure → place) so the pale tint panel and
  // DG monogram can be drawn BENEATH the text, mirroring the approved HTML
  // receipt's logo + tinted identity block.
  const nameX = MARGIN + 46;
  const nameW = CONTENT_W - 170 - 46;
  const identityLines = wrapPlaintext(
    winAnsiFold(data.company.name) || "Diplomat Global",
    nameW,
    20,
    true,
  );
  const taglineLines = data.company.tagline
    ? wrapPlaintext(data.company.tagline.toUpperCase(), nameW, 8, true)
    : [];
  const bnLine = data.company.registrationNumber ? `BN: ${data.company.registrationNumber}` : "";
  const contactLines = [
    data.company.address,
    data.company.email,
    data.company.phone,
    data.company.website,
  ].filter(Boolean);

  const headerRows: Array<{
    text: string;
    x: number;
    y: number;
    font: string;
    size: number;
    color: PdfColor;
  }> = [];
  let hy = PAGE_H - TOP_BAND_HEIGHT - 12;
  for (const line of identityLines) {
    headerRows.push({ text: line, x: nameX, y: hy - 16, font: FONT_BOLD, size: 20, color: NAVY });
    hy -= 24;
  }
  for (const [index, line] of taglineLines.entries()) {
    headerRows.push({ text: line, x: nameX, y: hy - 14, font: FONT_BOLD, size: 8, color: BLUE });
    hy -= index === taglineLines.length - 1 ? 16 : 13;
  }
  if (bnLine) {
    headerRows.push({
      text: bnLine,
      x: nameX,
      y: hy - 12,
      font: FONT_BOLD,
      size: 8.5,
      color: NAVY,
    });
    hy -= 15;
  }
  for (const contact of contactLines) {
    headerRows.push({
      text: contact,
      x: MARGIN,
      y: hy - 12,
      font: FONT_REGULAR,
      size: 8,
      color: MUTED,
    });
    hy -= 11.5;
  }
  const headerBottom = Math.min(hy, PAGE_H - 98) - 12;

  // Pale tinted panel behind the whole identity block (like the HTML header).
  page.rect(
    MARGIN,
    headerBottom + 2,
    CONTENT_W,
    PAGE_H - TOP_BAND_HEIGHT - 4 - (headerBottom + 2),
    SKY,
  );

  // DG monogram square, vertically aligned with the company name.
  const logoSize = 34;
  const logoTop = PAGE_H - TOP_BAND_HEIGHT - 18;
  page.rect(MARGIN, logoTop - logoSize, logoSize, logoSize, NAVY);
  page.text(
    "DG",
    MARGIN + (logoSize - estimateTextWidth("DG", 14, true)) / 2,
    logoTop - logoSize + 12,
    FONT_BOLD,
    14,
    WHITE,
  );

  for (const row of headerRows) {
    page.text(row.text, row.x, row.y, row.font, row.size, row.color);
  }

  page.text(
    "OFFICIAL DIGITAL DOCUMENT",
    PAGE_W - MARGIN - estimateTextWidth("OFFICIAL DIGITAL DOCUMENT", 7, true),
    PAGE_H - 44,
    FONT_BOLD,
    7,
    BLUE,
  );
  page.text(
    "PAYMENT RECEIPT",
    PAGE_W - MARGIN - estimateTextWidth("PAYMENT RECEIPT", 13, true),
    PAGE_H - 60,
    FONT_BOLD,
    13,
    NAVY,
  );
  const pillWidth = 64;
  page.rect(PAGE_W - MARGIN - pillWidth, PAGE_H - 88, pillWidth, 19, GREEN_BG);
  page.text(
    data.payment_status,
    PAGE_W - MARGIN - pillWidth + 17,
    PAGE_H - 81.5,
    FONT_BOLD,
    9.5,
    GREEN,
  );

  page.rule(MARGIN, headerBottom, PAGE_W - MARGIN, headerBottom, LINE, 0.8);

  // ── Meta strip: receipt number / receipt date / order reference ──
  const metaHeight = 40;
  const metaTop = headerBottom - 10;
  page.rect(MARGIN, metaTop - metaHeight, CONTENT_W, metaHeight, SKY);
  const metaRow: Array<[string, string]> = [
    ["RECEIPT NUMBER", data.receipt_number],
    ["RECEIPT DATE", formatPdfDate(data.receipt_date)],
    ["ORDER ID / REFERENCE", data.order_reference],
  ];
  const metaCell = CONTENT_W / 3;
  metaRow.forEach(([label, value], index) => {
    const cellX = MARGIN + index * metaCell + 12;
    page.text(label, cellX, metaTop - 15, FONT_BOLD, 7, MUTED);
    page.text(value, cellX, metaTop - 31, FONT_BOLD, 9.5, NAVY);
  });

  y = metaTop - metaHeight - 24;

  // ── Customer information (2-col cells mirroring the approved HTML card) ──
  page.text("CUSTOMER INFORMATION", MARGIN, y, FONT_BOLD, 8, BLUE);
  y -= 10;
  const custGap = 28;
  const custColW = (CONTENT_W - custGap) / 2;
  const custPad = 14;
  const custRows: Array<Array<{ label: string; lines: string[]; x: number }>> = [
    [
      {
        label: "Name",
        lines: wrapPlaintext(data.customer_name || "Not provided", custColW - 8, 9.5),
        x: MARGIN + custPad,
      },
      {
        label: "Email",
        lines: wrapPlaintext(data.customer_email || "Not provided", custColW - 8, 9.5),
        x: MARGIN + custPad + custColW + custGap,
      },
    ],
    [
      {
        label: "Phone",
        lines: wrapPlaintext(data.customer_phone || "Not provided", custColW - 8, 9.5),
        x: MARGIN + custPad,
      },
    ],
    [
      {
        label: "Delivery Address",
        lines: wrapPlaintext(data.delivery_address || "Not provided", CONTENT_W - custPad * 2, 9.5),
        x: MARGIN + custPad,
      },
    ],
  ];
  const custRowHeights = custRows.map(
    (row) => 13 + Math.max(...row.map((c) => c.lines.length)) * 12.5 + 6,
  );
  const custCardH = custPad + custRowHeights.reduce((a, b) => a + b, 0) - 6 + custPad;
  ensure(custCardH + 8);
  page.rect(MARGIN, y - custCardH, CONTENT_W, custCardH, undefined, LINE, 0.9);
  let custY = y - custPad;
  custRows.forEach((row, ri) => {
    for (const cell of row) {
      page.text(cell.label, cell.x, custY, FONT_BOLD, 7, MUTED);
      for (const [li, line] of cell.lines.entries()) {
        page.text(line, cell.x, custY - 13 - li * 12.5, FONT_REGULAR, 9.5, INK);
      }
    }
    custY -= custRowHeights[ri];
  });
  y -= custCardH + 14;

  // ── Description of goods ──
  ensure(64);
  page.text("DESCRIPTION OF GOODS", MARGIN, y, FONT_BOLD, 8, BLUE);
  y -= 10;

  const qtyColWidth = 44;
  const unitColWidth = 108;
  const amountColWidth = 108;
  const productColWidth = CONTENT_W - qtyColWidth - unitColWidth - amountColWidth;
  const qtyColX = MARGIN;
  const productColX = MARGIN + qtyColWidth;
  const unitColX = productColX + productColWidth;
  const amountColX = unitColX + unitColWidth;

  page.rect(MARGIN, y - 20, CONTENT_W, 20, NAVY);
  page.text(
    "QTY",
    qtyColX + (qtyColWidth - estimateTextWidth("QTY", 7.5, true)) / 2,
    y - 13.5,
    FONT_BOLD,
    7.5,
    WHITE,
  );
  page.text("PRODUCT", productColX + 10, y - 13.5, FONT_BOLD, 7.5, WHITE);
  page.text(
    "UNIT PRICE",
    unitColX + unitColWidth - 10 - estimateTextWidth("UNIT PRICE", 7.5, true),
    y - 13.5,
    FONT_BOLD,
    7.5,
    WHITE,
  );
  page.text(
    "AMOUNT",
    amountColX + amountColWidth - 10 - estimateTextWidth("AMOUNT", 7.5, true),
    y - 13.5,
    FONT_BOLD,
    7.5,
    WHITE,
  );
  y -= 20;

  for (const item of data.items) {
    const nameLines = wrapPlaintext(item.name, productColWidth - 20, 9.5, true);
    const skuLines = item.sku ? wrapPlaintext(`SKU: ${item.sku}`, productColWidth - 20, 7.5) : [];
    const rowHeight = Math.max(26, 12 + nameLines.length * 12 + skuLines.length * 10 + 4);
    ensure(rowHeight + 8);
    let lineY = y - 16;
    for (const line of nameLines) {
      page.text(line, productColX + 10, lineY, FONT_BOLD, 9.5, NAVY);
      lineY -= 12;
    }
    for (const line of skuLines) {
      page.text(line, productColX + 10, lineY, FONT_REGULAR, 7.5, MUTED);
      lineY -= 10;
    }
    const qtyText = String(item.quantity);
    page.text(
      qtyText,
      qtyColX + (qtyColWidth - estimateTextWidth(qtyText, 9.5, false)) / 2,
      y - 16,
      FONT_REGULAR,
      9.5,
      NAVY,
    );
    const unitText = formatPdfMoney(item.unit_price, data.currency);
    page.text(
      unitText,
      unitColX + unitColWidth - 10 - estimateTextWidth(unitText, 9, false),
      y - 16,
      FONT_REGULAR,
      9,
      MUTED,
    );
    const amountText = formatPdfMoney(item.line_total, data.currency);
    page.text(
      amountText,
      amountColX + amountColWidth - 10 - estimateTextWidth(amountText, 9.5, true),
      y - 16,
      FONT_BOLD,
      9.5,
      NAVY,
    );
    y -= rowHeight;
    page.rule(MARGIN, y + 8, PAGE_W - MARGIN, y + 8, ROW_RULE, 0.5);
  }

  // ── Payment details (left, 2-col cells like the approved HTML) + totals (right) ──
  const totalsWidth = 216;
  const totalsX = PAGE_W - MARGIN - totalsWidth;
  const totalsHeight = 96;
  const payCardX = MARGIN;
  const payCardW = totalsX - 24 - MARGIN;
  const payPad = 14;
  const payCellW = (payCardW - payPad * 2 - 24) / 2;
  const payEntries: Array<[string, string]> = [
    ["Payment Method", data.payment_method],
    ["Payment Status", data.payment_status],
    ["Payment Reference", data.payment_reference],
    ["Currency", data.currency],
    ["Payment Date / Time", formatPdfDate(data.payment_date, true)],
    ["Order ID", data.order_reference],
  ];
  const payCells = payEntries.map(([label, value]) => ({
    label,
    lines: wrapPlaintext(value, payCellW, 9),
  }));
  const payRows = [payCells.slice(0, 2), payCells.slice(2, 4), payCells.slice(4, 6)];
  const payRowHeights = payRows.map(
    (row) => 12 + Math.max(...row.map((c) => c.lines.length)) * 12 + 7,
  );
  const payCardH = payPad + payRowHeights.reduce((a, b) => a + b, 0) - 7 + payPad;
  const panelH = Math.max(totalsHeight, payCardH);
  ensure(panelH + 40);
  y -= 16;
  page.text("PAYMENT DETAILS", MARGIN, y, FONT_BOLD, 8, BLUE);
  page.rect(payCardX, y - panelH, payCardW, panelH, undefined, LINE, 0.9);
  page.rect(totalsX, y - panelH, totalsWidth, panelH, SKY);

  let payY = y - payPad;
  payRows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const cellX = payCardX + payPad + ci * (payCellW + 24);
      page.text(cell.label, cellX, payY, FONT_BOLD, 7, MUTED);
      for (const [li, line] of cell.lines.entries()) {
        page.text(line, cellX, payY - 12 - li * 12, FONT_REGULAR, 9, INK);
      }
    });
    payY -= payRowHeights[ri];
  });

  let totalsY = y - 18;
  const totalsRow = (label: string, value: string, size = 9): void => {
    page.text(label, totalsX + 14, totalsY, FONT_REGULAR, size, MUTED);
    page.text(
      value,
      totalsX + totalsWidth - 14 - estimateTextWidth(value, size, true),
      totalsY,
      FONT_BOLD,
      size,
      INK,
    );
  };
  totalsRow("Subtotal", formatPdfMoney(data.subtotal, data.currency));
  totalsY -= 16;
  totalsRow("Coupon / Discount", `-${formatPdfMoney(data.discount, data.currency)}`);
  totalsY -= 16;
  totalsRow(
    "Delivery",
    data.delivery_fee === 0 ? "Free" : formatPdfMoney(data.delivery_fee, data.currency),
  );
  totalsY -= 16;
  if (data.delivery_fee === 0) {
    page.text(
      "FREE DELIVERY",
      totalsX + totalsWidth - 14 - estimateTextWidth("FREE DELIVERY", 7, true),
      totalsY,
      FONT_BOLD,
      7,
      GREEN,
    );
    totalsY -= 14;
  }
  page.rule(totalsX, totalsY, totalsX + totalsWidth, totalsY, BLUE, 1.2);
  totalsY -= 18;
  const totalPaidText = formatPdfMoney(data.total, data.currency);
  page.text("Total Paid", totalsX + 14, totalsY, FONT_BOLD, 11, NAVY);
  page.text(
    totalPaidText,
    totalsX + totalsWidth - 14 - estimateTextWidth(totalPaidText, 11, true),
    totalsY,
    FONT_BOLD,
    11,
    BLUE,
  );

  y = Math.max(Math.min(payY, totalsY - 8) - 16, CONTENT_BOTTOM + 4);

  // ── Closing note ──
  ensure(36);
  page.rect(MARGIN, y - 30, CONTENT_W, 30, CLOSING_BG);
  page.rect(MARGIN, y - 30, 3, 30, BLUE);
  page.text("Thank you for your patronage.", MARGIN + 14, y - 12, FONT_BOLD, 10, NAVY);
  page.text("Keep this receipt as proof of payment.", MARGIN + 14, y - 24, FONT_REGULAR, 8, MUTED);

  // ── Footer on every page ──
  for (const [index, footerPage] of pages.entries()) {
    footerPage.rule(MARGIN, 40, PAGE_W - MARGIN, 40, LINE, 0.6);
    footerPage.text(
      `${data.company.name} · Payment receipt ${data.receipt_number} · ${data.order_reference}`,
      MARGIN,
      30,
      FONT_REGULAR,
      7,
      MUTED,
    );
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    footerPage.text(
      pageLabel,
      PAGE_W - MARGIN - estimateTextWidth(pageLabel, 7, false),
      30,
      FONT_REGULAR,
      7,
      MUTED,
    );
  }

  return pages;
}

// ─── Serialization ───

/**
 * PDF string semantics are WinAnsi (single byte). winAnsiFold already keeps
 * every character in U+0000..U+00FF; this encoder preserves those bytes
 * exactly (TextEncoder would emit UTF-8 pairs like 0xC2 0xB7 for "·").
 */
function encodeLatin1(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes[index] = code <= 0xff ? code : 0x3f; // '?' guard for anything unforeseen
  }
  return bytes;
}

function assemblePdf(pages: PdfPage[], data: ReceiptDocumentData): Uint8Array {
  const pageCount = pages.length;
  const catalogNum = 1;
  const pagesNum = 2;
  const firstFontNum = 3;
  const firstPageNum = firstFontNum + 3;

  const objects = new Map<number, string | Uint8Array>();
  objects.set(catalogNum, "<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectNums = pages.map((_, index) => firstPageNum + index);
  objects.set(
    pagesNum,
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectNums.map((n) => `${n} 0 R`).join(" ")}] >>`,
  );

  const fonts: Array<[string, string]> = [
    [FONT_REGULAR, "Helvetica"],
    [FONT_BOLD, "Helvetica-Bold"],
    [FONT_ITALIC, "Helvetica-Oblique"],
  ];
  fonts.forEach(([key, baseFont], index) => {
    void key;
    objects.set(
      firstFontNum + index,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`,
    );
  });

  pages.forEach((page, index) => {
    const pageNum = firstPageNum + index;
    const contentNum = pageNum + pageCount;
    const content = encodeLatin1(page.ops.join("\n"));
    objects.set(
      pageNum,
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /${FONT_REGULAR} ${firstFontNum} 0 R /${FONT_BOLD} ${firstFontNum + 1} 0 R /${FONT_ITALIC} ${firstFontNum + 2} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    objects.set(contentNum, content);
  });

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushString = (value: string): void => push(new TextEncoder().encode(value));

  pushString("%PDF-1.4\n");
  // Binary marker comment so strict readers treat the file as binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const maxObjectNum = firstPageNum + pageCount * 2 - 1;
  const offsets = new Map<number, number>();
  for (let objectNum = 1; objectNum <= maxObjectNum; objectNum += 1) {
    const payload = objects.get(objectNum);
    if (!payload) continue;
    offsets.set(objectNum, offset);
    pushString(`${objectNum} 0 obj\n`);
    if (typeof payload === "string") {
      pushString(`${payload}\n`);
    } else {
      pushString(`<< /Length ${payload.length} >>\nstream\n`);
      push(payload);
      pushString("\nendstream\n");
    }
    pushString("endobj\n");
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${maxObjectNum + 1}\n0000000000 65535 f \n`;
  for (let objectNum = 1; objectNum <= maxObjectNum; objectNum += 1) {
    xref += `${String(offsets.get(objectNum) ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pushString(xref);
  const infoTitle = winAnsiFold(`Payment Receipt ${data.receipt_number}`);
  const infoAuthor = winAnsiFold(data.company.name);
  const infoSubject = winAnsiFold(`Order ${data.order_reference}`);
  pushString(
    `trailer\n<< /Size ${maxObjectNum + 1} /Root ${catalogNum} 0 R /Info << /Title (${pdfEscape(infoTitle)}) /Author (${pdfEscape(infoAuthor)}) /Subject (${pdfEscape(infoSubject)}) /Creator (${pdfEscape(infoAuthor)}) >> >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

// ─── Public API ───

/** Render the canonical receipt document as a genuine PDF. */
export function generateReceiptPdf(data: ReceiptDocumentData): Uint8Array {
  return assemblePdf(buildReceiptPdfPages(data), data);
}

/** Required download filename: Diplomat-Global-Receipt-<REFERENCE>.pdf */
export function formatReceiptPdfFilename(receiptNumber: string): string {
  const safe = receiptNumber.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `Diplomat-Global-Receipt-${safe || "download"}.pdf`;
}
