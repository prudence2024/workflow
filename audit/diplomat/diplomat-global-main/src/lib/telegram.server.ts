import "@tanstack/react-start/server-only";

/**
 * Telegram Bot notification service for admin payment alerts.
 *
 * Flow:
 *   Paystack webhook → verified → payment saved → Brevo receipts → Telegram admin alert
 *
 * Environment variables (server-side only):
 *   TELEGRAM_BOT_TOKEN - Bot token from @BotFather
 *   TELEGRAM_ADMIN_CHAT_ID - Chat ID for admin notifications
 */

interface TelegramConfig {
  botToken: string;
  adminChatId: string;
}

function getConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

  if (botToken && adminChatId) {
    return { botToken, adminChatId };
  }
  return null;
}

export function isTelegramConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Verify Telegram bot connectivity by calling getMe.
 * Returns bot identity if successful, sanitized error otherwise.
 * Never exposes the token in logs or return values.
 */
export async function verifyTelegramConnectivity(): Promise<
  | { ok: true; botId: number; botUsername: string; botFirstName: string }
  | { ok: false; error: string }
> {
  const config = getConfig();
  if (!config) {
    return { ok: false, error: "Telegram not configured" };
  }
  const botToken = config.botToken;
  try {
    const { httpStatus, data } = await callTelegramApi(botToken, "getMe", {});
    if (!httpStatus.toString().startsWith("2") || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${httpStatus}` };
    }
    return {
      ok: true,
      botId: (data.result as { id: number }).id,
      botUsername: (data.result as { username?: string }).username || "unknown",
      botFirstName: (data.result as { first_name?: string }).first_name || "unknown",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Verify that the bot can access the configured chat.
 * Returns chat info if successful.
 */
export async function verifyTelegramChat(): Promise<
  { ok: true; chatId: string } | { ok: false; error: string }
> {
  const config = getConfig();
  if (!config) {
    return { ok: false, error: "Telegram not configured" };
  }
  const botToken = config.botToken;
  try {
    // Use getChat to verify bot can access the destination
    const { httpStatus, data } = await callTelegramApi(botToken, "getChat", {
      chat_id: config.adminChatId,
    });
    if (!httpStatus.toString().startsWith("2") || !data.ok) {
      return {
        ok: false,
        error: data.description || `Chat not accessible: HTTP ${httpStatus}`,
      };
    }
    return { ok: true, chatId: config.adminChatId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Chat verification failed",
    };
  }
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Send via the Telegram Bot API with a hard timeout and a plain-text retry.
 *
 * parse_mode "Markdown" fails with 400 "can't parse entities" whenever dynamic
 * content (order refs, customer names) contains unmatched * or _ — proven live.
 * On that specific failure we resend the SAME message without parse_mode so the
 * reply is always delivered (slightly less pretty beats silent drop).
 */
const TELEGRAM_HTTP_TIMEOUT_MS = 10_000;

interface TelegramApiResult {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

async function callTelegramApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; data: TelegramApiResult }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TELEGRAM_HTTP_TIMEOUT_MS),
  });
  const data = (await response.json()) as TelegramApiResult;
  return { httpStatus: response.status, data };
}

async function sendWithParseFallback(
  botToken: string,
  body: Record<string, unknown>,
): Promise<TelegramSendResult> {
  try {
    const { httpStatus, data } = await callTelegramApi(botToken, "sendMessage", {
      ...body,
      parse_mode: "Markdown",
    });
    if (httpStatus === 400 && data.description?.includes("can't parse entities")) {
      // Markdown entity failure — retry identical message as plain text.
      const retry = await callTelegramApi(botToken, "sendMessage", {
        ...body,
        parse_mode: undefined,
      });
      if (!retry.httpStatus.toString().startsWith("2") || !retry.data.ok) {
        return {
          success: false,
          error: retry.data.description || `Telegram API error: ${retry.httpStatus}`,
        };
      }
      return { success: true, messageId: retry.data.result?.message_id };
    }
    if (!httpStatus.toString().startsWith("2") || !data.ok) {
      return { success: false, error: data.description || `Telegram API error: ${httpStatus}` };
    }
    return { success: true, messageId: data.result?.message_id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Telegram error",
    };
  }
}

/**
 * Send a message to the admin Telegram chat.
 */
export async function sendTelegramMessage(message: string): Promise<TelegramSendResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      error: "Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID",
    };
  }
  return sendWithParseFallback(config.botToken, {
    chat_id: config.adminChatId,
    text: message,
  });
}

/**
 * Send a new payment notification to the admin.
 * Called after Paystack webhook verification + payment persistence.
 */
export async function sendPaymentNotification(input: {
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  reference: string;
  status: string;
  paidAt: Date;
}): Promise<TelegramSendResult> {
  const currency = input.currency || "NGN";
  const amount =
    currency === "NGN" ? `₦${input.amount.toLocaleString("en-NG")}` : `${currency} ${input.amount}`;

  const dateStr = input.paidAt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = input.paidAt.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusEmoji =
    input.status === "success" || input.status === "completed"
      ? "✅"
      : input.status === "failed"
        ? "❌"
        : "⏳";

  const message = [
    `💰 *NEW PAYMENT*`,
    ``,
    `Amount: ${amount}`,
    ``,
    `Customer: ${input.customerName}`,
    `Email: ${input.customerEmail}`,
    ``,
    `Reference: ${input.reference}`,
    `Status: ${statusEmoji} ${input.status}`,
    ``,
    `Time: ${dateStr}, ${timeStr}`,
  ].join("\n");

  return sendTelegramMessage(message);
}

/**
 * Send a message to a specific chat ID (used for webhook replies).
 * Hard 10s timeout + plain-text retry on Markdown parse failure.
 */
export async function sendTelegramToChat(
  chatId: number | string,
  message: string,
): Promise<TelegramSendResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: "Telegram not configured" };
  }
  return sendWithParseFallback(config.botToken, {
    chat_id: chatId,
    text: message,
  });
}

/**
 * Send a general admin alert to the configured admin chat.
 */
export async function sendAdminAlert(title: string, body: string): Promise<TelegramSendResult> {
  const message = `🔔 *${title}*\n\n${body}`;
  return sendTelegramMessage(message);
}

/**
 * Register the bot command menu with Telegram via setMyCommands.
 * Should be called during webhook setup or integration config change.
 */
export async function registerBotCommands(
  commands: Array<{ command: string; description: string }>,
): Promise<TelegramSendResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: "Telegram not configured" };
  }
  const botToken = config.botToken;
  try {
    const { httpStatus, data } = await callTelegramApi(botToken, "setMyCommands", { commands });
    if (!httpStatus.toString().startsWith("2") || !data.ok) {
      return { success: false, error: data.description || `HTTP ${httpStatus}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
