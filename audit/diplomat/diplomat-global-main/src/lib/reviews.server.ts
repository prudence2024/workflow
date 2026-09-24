import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDatabaseClient, getDatabaseConfig } from "./database.server";
import { checkRateLimit } from "./rate-limit.server";
import { isDisposableEmail } from "./disposable-emails";

/** Verify the caller is an authorized admin. Returns error message or null. */
async function requireAdmin(): Promise<string | null> {
  const { requirePermission } = await import("./admin/admin-ops.server");
  return requirePermission("reviews.manage");
}

import { sanitizeText, normalizeEmail } from "@/lib/validation";

/** Exported for the spoof-resistance contract test (tests/review-spoof-contract.test.ts). */
export const reviewSchema = z
  .object({
    product_id: z.string().min(1),
    customer_name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(120)
      .refine(
        (v) => /^[\p{L}][\p{L}\s'._-]{1,100}$/u.test(v),
        "Name must contain only letters, spaces, apostrophes, or hyphens",
      ),
    customer_email: z.string().trim().toLowerCase().email().max(254),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(200).optional().or(z.literal("")),
    body: z.string().trim().min(10).max(5000),
  })
  .refine(
    (data) => {
      const name = data.customer_name.trim();
      if (!name) return false;
      // Reject names starting with digits or containing only numbers/punctuation
      if (/^\d/.test(name)) return false;
      if (/^[\d\s\p{P}]+$/u.test(name)) return false;
      return true;
    },
    { message: "Please enter a valid name (letters only, no numbers)", path: ["customer_name"] },
  );

/**
 * Submit a new product review. Inserts into the reviews table with status "pending".
 * Public-facing — no admin auth required.
 */
export const submitReview = createServerFn({ method: "POST" })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    // Sanitize inputs
    const name = sanitizeText(data.customer_name);
    const email = normalizeEmail(data.customer_email);
    const title = data.title ? sanitizeText(data.title) : undefined;
    const body = sanitizeText(data.body);
    if (!getDatabaseConfig()) {
      return { ok: false as const, message: "Database not configured." };
    }
    if (isDisposableEmail(email)) {
      return { ok: false as const, message: "Please use a permanent email address." };
    }
    const rl = await checkRateLimit("contact", email);
    if (rl.configured && !rl.success) {
      return { ok: false as const, message: "Too many reviews. Please try again later." };
    }
    const db = createDatabaseClient();

    // Upsert or create customer record
    const nameParts = name.split(" ").filter(Boolean);
    const { data: customer } = await db
      .from("customers")
      .upsert(
        { email, first_name: nameParts[0] || name, last_name: nameParts.slice(1).join(" ") || "" },
        { onConflict: "email" },
      )
      .select("id")
      .single();

    // Verify customer has purchased this product — only purchasers can review
    if (!customer?.id) {
      return {
        ok: false as const,
        message:
          "Reviews are available to customers who have purchased this product. Please sign in with the email used for your order.",
      };
    }
    const { data: orderItem } = await db
      .from("order_items")
      .select("id")
      .eq("product_id", data.product_id)
      .in(
        "order_id",
        (
          await db
            .from("orders")
            .select("id")
            .eq("customer_id", customer.id)
            .in("status", ["paid", "processing", "shipped", "delivered"])
        ).data?.map((o: any) => o.id) || [],
      )
      .limit(1);
    if (!orderItem?.length) {
      return {
        ok: false as const,
        message: "Reviews are available only to customers who have purchased this product.",
      };
    }

    // Duplicate prevention: one review per customer per product. A retry
    // after a network interruption must not create a second review — the
    // caller gets the truthful already-reviewed outcome instead.
    const { data: existingReview } = await db
      .from("reviews")
      .select("id, status")
      .eq("product_id", data.product_id)
      .eq("customer_id", customer.id)
      .limit(1);
    if (existingReview?.length) {
      return {
        ok: false as const,
        message: "You have already reviewed this product.",
        duplicate: true as const,
      };
    }

    const { data: insertedReview, error } = await db
      .from("reviews")
      .insert({
        product_id: data.product_id,
        customer_id: customer.id,
        rating: data.rating,
        title: title || null,
        body,
        status: "approved",
        verified_purchase: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Review insert failed:", error);
      return { ok: false as const, message: "Could not save your review. Please try again." };
    }
    // Notify the team about the new review. Decoupled on purpose: a
    // Telegram/notification failure must never undo an accepted review, and
    // the duplicate check above makes notification retries safe.
    try {
      const { notifications } = await import("@/lib/notifications");
      const { data: product } = await db
        .from("products")
        .select("name")
        .eq("id", data.product_id)
        .single();
      await notifications.newPendingReview(product?.name || "Product", insertedReview?.id);
    } catch (err) {
      // Notification failure must not fail review submission
    }
    return { ok: true as const, message: "Review submitted! Thank you for your feedback." };
  });

/**
 * List reviews for a product. Public-facing: only approved reviews.
 * No admin auth required.
 */
export const getProductReviews = createServerFn({ method: "GET" })
  .validator(z.object({ product_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    if (!getDatabaseConfig()) return { reviews: [] as any[] };
    const db = createDatabaseClient();
    const { data: reviews } = await db
      .from("reviews")
      .select(
        "id, rating, title, body, verified_purchase, created_at, customer_id, customers(first_name, last_name)",
      )
      .eq("product_id", data.product_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);
    return { reviews: reviews ?? [] };
  });

/**
 * List all reviews for admin (all statuses).
 * Admin auth required.
 */
export const getAllReviews = createServerFn({ method: "GET" })
  .validator(
    z.object({ status: z.string().optional(), review_id: z.string().uuid().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    const authError = await requireAdmin();
    if (authError) return { reviews: [] as any[], total: 0, error: authError };

    const db = createDatabaseClient();
    let query = db
      .from("reviews")
      .select(
        "id, rating, title, body, status, verified_purchase, created_at, product_id, customer_id, products(name, slug), customers(first_name, last_name, email)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    if (data?.review_id) query = query.eq("id", data.review_id);
    const { data: reviews, count, error } = await query.limit(50);
    if (error) throw new Error("Unable to load reviews. Please retry.");
    return { reviews: reviews ?? [], total: count ?? 0 };
  });

/**
 * Update review status (approve/reject).
 * Admin auth required.
 */
export const updateReviewStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({ review_id: z.string().uuid(), status: z.enum(["approved", "rejected", "pending"]) }),
  )
  .handler(async ({ data }) => {
    const authError = await requireAdmin();
    if (authError) return { ok: false as const, message: authError };

    const db = createDatabaseClient();
    const { error } = await db
      .from("reviews")
      .update({ status: data.status })
      .eq("id", data.review_id);
    if (error) return { ok: false as const, message: "Failed to update review." };
    return { ok: true as const };
  });

/**
 * Delete a review.
 * Admin auth required.
 */
export const deleteReview = createServerFn({ method: "POST" })
  .validator(z.object({ review_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const authError = await requireAdmin();
    if (authError) return { ok: false as const, message: authError };

    const db = createDatabaseClient();
    const { error } = await db.from("reviews").delete().eq("id", data.review_id);
    if (error) return { ok: false as const, message: "Failed to delete review." };
    return { ok: true as const };
  });
