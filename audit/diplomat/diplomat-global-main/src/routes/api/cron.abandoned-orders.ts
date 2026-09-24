/**
 * Cron endpoint for abandoned order lifecycle.
 *
 * Call this endpoint periodically (e.g., every hour) via Vercel Cron or manual trigger.
 * Marks pending orders older than 24 hours as 'abandoned'.
 *
 * Security: Only accepts requests with a valid CRON_SECRET header.
 * Configure CRON_SECRET in Vercel environment variables.
 */
import { createFileRoute } from "@tanstack/react-router";
import { markAbandonedOrders } from "@/lib/abandoned-orders.server";

export const Route = createFileRoute("/api/cron/abandoned-orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Verify cron secret
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET?.trim();

        if (!cronSecret) {
          return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let result;
        try {
          result = await markAbandonedOrders();
        } catch (err: any) {
          // Cron job failure — create notification
          try {
            const { notifications } = await import("@/lib/notifications");
            await notifications.cronFailure("abandoned-orders", err?.message);
          } catch {}
          return new Response(JSON.stringify({ ok: false, error: err?.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Send heartbeat on success (if configured)
        if (result.ok) {
          const heartbeatUrl = process.env.UPTIME_CRON_HEARTBEAT_URL?.trim();
          if (heartbeatUrl) {
            try {
              await fetch(heartbeatUrl, { method: "POST", signal: AbortSignal.timeout(5000) });
            } catch {
              // Heartbeat failure must not fail the cron
              console.error("[cron] Heartbeat failed (non-fatal)");
            }
          }
        }

        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
