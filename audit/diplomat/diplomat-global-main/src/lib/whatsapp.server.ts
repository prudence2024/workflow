/**
 * DEPRECATED — WhatsApp Business API has been removed from the payment notification flow.
 *
 * Admin payment notifications now use Telegram Bot: see src/lib/telegram.server.ts
 *
 * Customer receipts continue to use Brevo (transactional email).
 *
 * This file is retained only as a no-op stub so existing imports do not break.
 * Remove this file once all imports have been migrated.
 */

export function isWhatsAppConfigured(): boolean {
  return false;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(_input: {
  to: string;
  message: string;
}): Promise<WhatsAppSendResult> {
  console.warn(
    "[whatsapp.server] DEPRECATED: use Telegram for admin notifications (see telegram.server.ts)",
  );
  return { success: false, error: "WhatsApp removed — use Telegram" };
}

export async function sendReceiptWhatsApp(_input: {
  to: string;
  receiptNumber: string;
  orderReference: string;
  total: number;
  currency?: string;
}): Promise<WhatsAppSendResult> {
  console.warn("[whatsapp.server] DEPRECATED: receipts now use Brevo email");
  return { success: false, error: "WhatsApp removed — use Brevo for receipts" };
}

export async function sendAdminOrderNotification(_input: {
  adminPhone: string;
  orderReference: string;
  customerEmail: string;
  total: number;
  currency?: string;
}): Promise<WhatsAppSendResult> {
  console.warn(
    "[whatsapp.server] DEPRECATED: use Telegram for admin notifications (see telegram.server.ts)",
  );
  return { success: false, error: "WhatsApp removed — use Telegram" };
}
