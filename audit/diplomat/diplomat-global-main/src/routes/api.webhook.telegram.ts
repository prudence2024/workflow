import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramToChat } from "@/lib/telegram.server";
import { routeCommand } from "@/lib/telegram/commands/router.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import type { CommandContext } from "@/lib/telegram/types.server";

/**
 * Telegram Bot Webhook Endpoint
 *
 * POST /api/telegram/webhook
 *
 * Telegram sends updates here when users send commands.
 *
 * Security:
 * - TELEGRAM_WEBHOOK_SECRET must be configured as server env var
 * - X-Telegram-Bot-Api-Secret-Token header must match
 * - Only authorized chat IDs (TELEGRAM_ADMIN_CHAT_ID) may use commands
 * - Unauthorized chats receive a generic access denied response
 */

// In-memory dedup for update_ids (best-effort, not durable across cold starts/instances)
// Telegram retries webhook updates on timeout/error, so dedup prevents double-processing.
// For durable idempotency, a persistent store would be needed (future enhancement).
const processedUpdates = new Set<number>();
const MAX_PROCESSED_CACHE = 1000;

function isAuthorizedChatId(chatId: number): boolean {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!adminChatId) return false;
  return String(chatId) === adminChatId;
}

export const Route = createFileRoute("/api/webhook/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Validate webhook secret
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
        if (!webhookSecret) {
          // Production/staging: reject if secret not configured
          const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";
          if (!isDev) {
            return new Response("Webhook not configured", { status: 503 });
          }
          // Local development: allow without secret
        } else {
          const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
          if (!secretToken || secretToken !== webhookSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        // 2. Parse update
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        // 3. Basic shape validation
        if (!body || typeof body.update_id !== "number") {
          return new Response("Bad request", { status: 400 });
        }

        // 4. Idempotency — skip duplicate update_ids
        const updateId = body.update_id;
        if (processedUpdates.has(updateId)) {
          return new Response("OK", { status: 200 });
        }
        processedUpdates.add(updateId);
        if (processedUpdates.size > MAX_PROCESSED_CACHE) {
          // Evict oldest entries
          const arr = Array.from(processedUpdates);
          for (let i = 0; i < 200; i++) processedUpdates.delete(arr[i]);
        }

        // 5. Extract message
        const message = body.message;
        if (!message || !message.text) {
          return new Response("OK", { status: 200 });
        }

        const chatId: number = message.chat?.id;
        const userId: number = message.from?.id;
        const username: string | undefined = message.from?.username;
        const firstName: string | undefined = message.from?.first_name;
        const text: string = message.text;

        if (!chatId || !userId) {
          return new Response("OK", { status: 200 });
        }

        // 6. Authorization — validate numeric chat ID
        if (!isAuthorizedChatId(chatId)) {
          // Rate limit unauthorized users to prevent abuse
          const unauthorizedRate = await checkRateLimit("telegram", `unauth:${chatId}`);
          if (unauthorizedRate.success === false && unauthorizedRate.configured) {
            await sendTelegramToChat(chatId, "Access denied.");
          }
          return new Response("OK", { status: 200 });
        }

        // 7. Rate limit authorized commands
        const rateLimit = await checkRateLimit("telegram", String(chatId));
        if (rateLimit.success === false && rateLimit.configured) {
          await sendTelegramToChat(chatId, "Too many requests. Please wait a moment.");
          return new Response("OK", { status: 200 });
        }

        // 8. Reject commands that are too long
        if (text.length > 200) {
          await sendTelegramToChat(chatId, "Command too long. Maximum 200 characters.");
          return new Response("OK", { status: 200 });
        }

        // 8. Route command
        const ctx: CommandContext = {
          text,
          chatId,
          userId,
          username,
          firstName,
          updateId,
        };

        try {
          const reply = await routeCommand(ctx);
          await sendTelegramToChat(chatId, reply);
        } catch (err) {
          console.error("[telegram-webhook] Command error:", err);
          await sendTelegramToChat(chatId, "\u274C An error occurred processing your command.");
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
  component: () => null,
});
