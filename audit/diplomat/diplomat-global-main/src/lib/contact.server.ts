import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { sendContactEmails } from "./email.server";
import { checkRateLimit } from "./rate-limit.server";
import { isDisposableEmail } from "./disposable-emails";

import { humanNameSchema, emailSchema, phoneSchema, freeTextSchema, sanitizeText, validatePhoneWithLock } from "@/lib/validation";

const contactSchema = z.object({
  name: humanNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  subject: freeTextSchema(3, 200),
  message: freeTextSchema(10, 5000),
  website: z.string().max(0), // honeypot
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .validator(contactSchema)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store, max-age=0");
    const rateLimit = await checkRateLimit("contact", data.email);
    if (!rateLimit.configured) {
      setResponseStatus(503);
      return {
        ok: false as const,
        message: "Contact form is not configured yet. Please use the support email instead.",
      };
    }
    if (!rateLimit.success) {
      setResponseStatus(429);
      setResponseHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1_000))),
      );
      return {
        ok: false as const,
        message: "Too many messages were sent. Please wait and try again.",
      };
    }

    // Block disposable/temporary email domains
    if (isDisposableEmail(data.email)) {
      return {
        ok: false as const,
        message: "Please use a permanent email address.",
      };
    }

    // Server-side phone lock enforcement
    const phoneError = await validatePhoneWithLock(data.phone || "");
    if (phoneError) {
      setResponseStatus(400);
      return { ok: false as const, message: phoneError };
    }

    // Persist to messages table first (always succeeds if DB is up)
    try {
      const { createDatabaseClient, getDatabaseConfig } = await import("./database.server");
      if (getDatabaseConfig()) {
        const db = createDatabaseClient();
        const fullMessage = data.phone
          ? `${data.message}\n\nPhone: ${data.phone}`
          : data.message;
        await db.from("messages").insert({
          name: data.name,
          email: data.email,
          subject: data.subject,
          message: fullMessage,
          is_read: false,
        });
      }
    } catch (err) {
      console.error("[contact] Failed to persist message to DB:", err);
    }

    // Try to send emails (best-effort)
    let emailSent = false;
    try {
      const result = await sendContactEmails(data);
      emailSent = result.sent;
    } catch (err) {
      console.error("[contact] Email sending failed:", err);
    }

    // Send Telegram admin notification (best-effort)
    try {
      const { sendAdminAlert } = await import("./telegram.server");
      const { buildContactAlert } = await import("./telegram/formatters/lead");
      const alertText = buildContactAlert({
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
      });
      await sendAdminAlert("New Contact", alertText);
    } catch (err) {
      // Telegram failure must not fail contact submission
    }

    // Create admin notification for new contact
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.newContactMessage(data.name, data.subject);
    } catch (err) {
      // Notification failure must not fail contact submission
    }

    // Always succeed if message was persisted — email is best-effort
    return {
      ok: true as const,
      message: emailSent
        ? "Message sent. A confirmation email is on its way."
        : "Message received. Our team will reply as soon as possible.",
    };
  });
