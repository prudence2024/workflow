import { isAllowedChat, handleTelegramCommand, sendTelegramMessage } from "@/lib/telegram";
import { recordWebhookEvent, markWebhookProcessed, verifyTelegramSecret } from "@/lib/webhooks";
import { safeErrorDiagnostic } from "@/lib/diagnostics";
import { readWebhookBody, WebhookBodyTooLargeError } from "@/lib/webhookBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * POST /api/webhooks/telegram — founder operations bot.
 *
 * Telegram supplies X-Telegram-Bot-Api-Secret-Token (set at setWebhook time).
 * That secret, plus a server-side chat allowlist, gates every command. Both
 * checks fail closed when unconfigured.
 */
export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegramSecret(secretHeader, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: "invalid secret token" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let update: {
    update_id?: number;
    message?: { chat?: { id?: number }; text?: string; from?: { id?: number } };
  } = {};
  try {
    const rawBody = await readWebhookBody(request);
    update = JSON.parse(rawBody) as typeof update;
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return new Response(JSON.stringify({ error: "payload too large" }), { status: 413, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  const eventId = String(update.update_id ?? `${chatId}:${Date.now()}`);

  const recorded = await recordWebhookEvent({
    provider: "telegram",
    eventId,
    eventType: "message",
    signatureValid: true,
    payload: update,
  });
  if (recorded.duplicate && !recorded.retryable) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: JSON_HEADERS });
  }

  if (!chatId || !text || !isAllowedChat(chatId)) {
    // Deliberately silent: unauthorised chats get no confirmation the bot exists.
    await markWebhookProcessed(recorded.id!, "ignored", "unauthorized_or_invalid_update");
    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: JSON_HEADERS });
  }

  try {
    const reply = await handleTelegramCommand(String(chatId), text);
    if (reply.ok) {
      await sendTelegramMessage(String(chatId), reply.text).catch(() => false);
    }
    await markWebhookProcessed(recorded.id!, "processed");
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  } catch (error) {
    await markWebhookProcessed(recorded.id!, "failed", safeErrorDiagnostic(error).safeMessage);
    return new Response(JSON.stringify({ error: "processing failed" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
