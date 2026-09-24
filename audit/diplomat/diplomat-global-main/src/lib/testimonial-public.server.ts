import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { checkRateLimit } from "./rate-limit.server";
import { humanNameSchema, freeTextSchema, sanitizeText } from "@/lib/validation";

/**
 * Server function for public testimonial submission.
 *
 * Accepts anonymous/public submissions for moderation.
 * New submissions are inserted with:
 *   moderation_status = 'pending'
 *   active = false
 *   consent_to_publish = true (from browser checkbox, validated server-side)
 *
 * Rate-limited by IP.
 * Server validation is authoritative (Zod schemas).
 * Contact info (email) is NOT displayed publicly.
 */
const testimonialSchema = z.object({
  name: humanNameSchema,
  email: z.string().trim().toLowerCase().max(254).email().optional().or(z.literal("")),
  rating: z.number().int().min(1).max(5).default(5),
  message: freeTextSchema(10, 2000),
  // Accept boolean true OR string "true" (RPC transport may coerce)
  consent_to_publish: z
    .union([z.literal(true), z.literal("true")])
    .refine((v) => v === true || v === "true", {
      message: "You must consent to publishing your testimonial.",
    }),
});

export const submitPublicTestimonial = createServerFn({ method: "POST" })
  .validator(testimonialSchema)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store, max-age=0");

    // Normalize consent — RPC may deliver boolean or string
    const consentGranted = data.consent_to_publish === true || data.consent_to_publish === "true";
    if (!consentGranted) {
      setResponseStatus(400);
      return { ok: false as const, message: "You must consent to publishing your testimonial." };
    }

    // Rate limit by IP
    try {
      const rl = await checkRateLimit("contact");
      if (rl.configured && !rl.success) {
        setResponseStatus(429);
        setResponseHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil((rl.reset - Date.now()) / 1_000))),
        );
        return {
          ok: false as const,
          message: "Too many submissions. Please wait and try again later.",
        };
      }
    } catch (rlErr) {
      console.error("[testimonial] Rate limit check failed (non-fatal):", rlErr);
      // Continue without rate limiting rather than blocking the user
    }

    try {
      const { createDatabaseClient, getDatabaseConfig } = await import("./database.server");
      if (!getDatabaseConfig()) {
        setResponseStatus(503);
        return { ok: false as const, message: "Database not configured." };
      }
      const db = createDatabaseClient();

      // Insert with moderation_status='pending' (requires admin approval)
      const { error } = await db.from("testimonials").insert({
        name: sanitizeText(data.name),
        message: sanitizeText(data.message),
        rating: data.rating,
        email: data.email || null,
        consent_to_publish: true,
        moderation_status: "pending",
        active: false, // not visible until approved
        sort_order: 0,
      });

      if (error) {
        console.error("[testimonial] Insert failed:", error.message, error.code, error.details);
        return { ok: false as const, message: "Failed to submit testimonial. Please try again." };
      }

      // Create notification for new pending testimonial
      try {
        const { notifications } = await import("@/lib/notifications");
        await notifications.newPendingTestimonial(sanitizeText(data.name));
      } catch (err) {
        // Notification failure must not fail testimonial submission
      }

      return {
        ok: true as const,
        message: "Thank you! Your testimonial has been submitted and will appear after review.",
      };
    } catch (err: any) {
      console.error("[testimonial] Unexpected error:", err?.message || err);
      return {
        ok: false as const,
        message: `An unexpected error occurred: ${err?.message || "unknown"}. Please try again.`,
      };
    }
  });
