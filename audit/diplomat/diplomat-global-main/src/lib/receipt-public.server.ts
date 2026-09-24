/** Public receipt rendering by opaque token — HTML (default) or genuine PDF. */
import { generateReceiptHTML, loadReceiptDocumentByToken } from "@/lib/receipt.server";
import { isOpaqueReceiptToken } from "@/lib/receipt-document";
import { formatReceiptPdfFilename, generateReceiptPdf } from "@/lib/receipt-pdf";

function receiptResponse(
  body: Uint8Array | string,
  contentType: string,
  filename: string,
): Response {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function handleReceiptRequest(
  token: string,
  format: string | null,
): Promise<Response> {
  if (!token) return new Response("Missing token", { status: 400 });

  if (!isOpaqueReceiptToken(token)) return new Response("Invalid token", { status: 400 });

  let receipt;
  try {
    receipt = await loadReceiptDocumentByToken(token);
  } catch {
    return new Response("Receipt is temporarily unavailable", { status: 503 });
  }
  if (!receipt) {
    return new Response("Receipt not found", { status: 404 });
  }

  // PDF format: same canonical receipt data, genuine application/pdf bytes.
  if (format === "pdf") {
    return receiptResponse(
      generateReceiptPdf(receipt),
      "application/pdf",
      formatReceiptPdfFilename(receipt.receipt_number),
    );
  }

  const html = generateReceiptHTML(receipt);
  return receiptResponse(
    html,
    "text/html; charset=utf-8",
    `receipt-${receipt.receipt_number || "download"}.html`,
  );
}
