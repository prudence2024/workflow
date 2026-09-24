import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit.server";
import { isDisposableEmail } from "./disposable-emails";

const newsletterSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  consent: z.boolean(),
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .validator(newsletterSchema)
  .handler(async ({ data }) => {
    if (!data.consent) {
      return { ok: false as const, message: "Consent is required to receive updates." };
    }
    const rateLimit = await checkRateLimit("newsletter", data.email);
    if (rateLimit.configured && !rateLimit.success) {
      return {
        ok: false as const,
        message: "Too many signup attempts. Please wait and try again.",
      };
    }

    const normalizedEmail = data.email.toLowerCase().trim();
    /** Whether a branded welcome email should be sent (new/reactivated only). */
    let sendWelcomeEmail = false;

    // Block disposable/temporary email domains
    if (isDisposableEmail(normalizedEmail)) {
      return {
        ok: false as const,
        message: "Please use a permanent email address.",
      };
    }

    // 1. Write to Supabase newsletter_subscribers (source of truth)
    try {
      const { createDatabaseClient, getDatabaseConfig } = await import("./database.server");
      if (getDatabaseConfig()) {
        const db = createDatabaseClient();
        // Check suppression — do NOT reactivate suppressed emails
        const { data: suppressed } = await db
          .from("marketing_suppression")
          .select("email")
          .eq("email", normalizedEmail)
          .maybeSingle();
        if (suppressed) {
          // Email is unsubscribed/suppressed — do not reactivate
          // Still return success to avoid revealing suppression status
          console.log("[newsletter] Suppressed email, not reactivating:", normalizedEmail);
          return { ok: true as const };
        }
        // Check if already an active subscriber — return friendly message
        const { data: existing } = await db
          .from("newsletter_subscribers")
          .select("email, is_active")
          .eq("email", normalizedEmail)
          .maybeSingle();
        if (existing?.is_active) {
          return {
            ok: true as const,
            already_subscribed: true as const,
            message: "You're already subscribed! Thank you for your continued interest.",
          };
        }
        // Upsert: if email exists, reactivate; otherwise insert new. The
        // welcome email below runs ONLY for genuinely new/reactivated
        // subscribers — a duplicate subscription never re-spams the email.
        const { error } = await db.from("newsletter_subscribers").upsert(
          {
            email: normalizedEmail,
            is_active: true,
            subscribed_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        );
        if (error) {
          console.error("[newsletter] Supabase insert failed:", error.message);
        } else {
          sendWelcomeEmail = true;
        }
      }
    } catch (err) {
      console.error("[newsletter] Supabase write failed:", err);
    }

    // 2. Write to Brevo (marketing list) — best-effort, non-blocking
    try {
      const { subscribeMarketingContact } = await import("./marketing.server");
      await subscribeMarketingContact(normalizedEmail, true);
    } catch (err) {
      console.error("[newsletter] Brevo write failed:", err);
    }

    // 2.5 Branded welcome email — best-effort; a delivery failure must never
    // fail or undo the subscription itself, and it is sent ONLY when this call
    // actually created/reactivated the subscription (sendWelcomeEmail).
    // Uses the same authoritative settings/social links the footer renders
    // (no hardcoded URLs).
    if (sendWelcomeEmail) {
      try {
        const { buildNewsletterWelcomeEmail } = await import("./newsletter-welcome.server");
        const { getSiteOrigin } = await import("./site-origin.server");
        const { getPublicSiteSettings, getPublicSocialLinks } = await import("./admin/server-fns");
        const [settingsRes, linksRes, origin] = await Promise.all([
          getPublicSiteSettings({}).catch(() => null),
          getPublicSocialLinks({}).catch(() => null),
          Promise.resolve(getSiteOrigin()),
        ]);
        const welcome = buildNewsletterWelcomeEmail({
          email: normalizedEmail,
          siteOrigin: origin,
          settings: settingsRes?.settings ?? {},
          socialLinks: (linksRes?.links ?? []).map(
            (link: { platform?: unknown; url?: unknown }) => ({
              platform: String(link.platform ?? ""),
              url: String(link.url ?? ""),
            }),
          ),
        });
        const { sendTransactionalEmail } = await import("./email.server");
        await sendTransactionalEmail({
          to: normalizedEmail,
          subject: welcome.subject,
          html: welcome.html,
          text: welcome.text,
        });
      } catch (err) {
        console.error("[newsletter] Welcome email failed (subscription preserved):", err);
      }
    }

    // 3. Send Telegram lead alert (best-effort)
    try {
      const { sendAdminAlert } = await import("./telegram.server");
      const { buildLeadAlert } = await import("./telegram/formatters/lead");
      const alertText = buildLeadAlert({
        email: normalizedEmail,
        source: "Newsletter signup",
      });
      await sendAdminAlert("New Lead", alertText);
    } catch {
      // Telegram failure must not fail newsletter signup
    }

    return { ok: true as const };
  });
