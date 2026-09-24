/**
 * Admin server function wrappers — all dashboard CRUD operations in one place.
 * Each function wraps the existing database functions with auth + createServerFn.
 */
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { mapProductGallery } from "../product-gallery";
import {
  buildCatalogSearchFilter,
  createCategoryRecord,
  deleteCategoryRecord,
  loadCategoryPage,
  updateCategoryRecord,
} from "@/lib/category-lifecycle";
import { cloudinaryImageUrlSchema, safeCtaLinkSchema } from "@/lib/cloudinary-upload-policy";
import { summarizeCogs } from "@/lib/analytics-cogs";
import {
  confirmCouponMutation,
  couponCodesEquivalent,
  createCouponRecord,
  loadCouponPage,
  normalizeCouponDateRange,
  normalizeCouponCode,
} from "@/lib/coupon-lifecycle";
import {
  confirmInventoryUpdate,
  isProductAvailable,
  resolveInventoryPage,
  resolveInventoryState,
} from "@/lib/inventory-lifecycle";

// Server-only imports are loaded dynamically inside each createServerFn handler.
// This avoids triggering TanStack Start import-protection at the module level.

// ══════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════
export const adminListOrders = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { readOrdersPage } = await import("./orders-query.server");
    return readOrdersPage({ data });
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .validator(z.object({ order_id: z.string().uuid(), status: z.string() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("orders.update", {
      auditOnDenial: true,
      context: "update order status",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.order_id);
    if (error) return { ok: false as const, message: "Failed to update order." };
    logAudit("order.status_update", "order", data.order_id, { status: data.status });
    return { ok: true as const };
  });

// ── Order Detail ──────────────────────────────────────────────
export const adminGetOrderDetail = createServerFn({ method: "GET" })
  .validator(z.object({ order_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("orders.view");
    if (authError) return { order: null, error: authError };
    const db = createDatabaseClient();
    const { data: order, error } = await db
      .from("orders")
      .select("*, customers(*), order_items(*), receipts(*)")
      .eq("id", data.order_id)
      .single();
    if (error || !order) return { order: null, error: "Order not found" };
    // Also fetch payment transactions
    const { data: transactions } = await db
      .from("payment_transactions")
      .select(
        "id, reference, paystack_reference, amount, status, channel, paid_at, gateway_response, created_at",
      )
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false });
    return { order, transactions: transactions || [] };
  });

// ══════════════════════════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════════════════════════
export const adminListCustomers = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("customers.view");
    if (authError)
      return {
        customers: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("customers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.search) {
      query = query.or(
        `first_name.ilike.%${data.search}%,last_name.ilike.%${data.search}%,email.ilike.%${data.search}%`,
      );
    }
    const { data: customers, count, error } = await query.range(from, to);
    if (error) throw new Error("Unable to load customers. Please retry.");
    const total = count ?? 0;
    return {
      customers: customers ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const adminUpdateCustomer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      customer_id: z.string().uuid(),
      first_name: z.string().max(100).optional(),
      last_name: z.string().max(100).optional(),
      phone: z.string().max(30).optional().nullable(),
      state: z.string().max(100).optional().nullable(),
      lga: z.string().max(100).optional().nullable(),
      city: z.string().max(100).optional().nullable(),
      address: z.string().max(500).optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("customers.edit");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const payload: Record<string, any> = {};
    if (data.first_name !== undefined) {
      const trimmed = data.first_name?.trim() || null;
      if (trimmed) {
        const { humanNameSchema } = await import("@/lib/validation");
        const result = humanNameSchema.safeParse(trimmed);
        if (!result.success)
          return {
            ok: false as const,
            message: `Invalid first name: ${result.error.errors[0]?.message}`,
          };
      }
      payload.first_name = trimmed;
    }
    if (data.last_name !== undefined) {
      const trimmed = data.last_name?.trim() || null;
      if (trimmed) {
        const { humanNameSchema } = await import("@/lib/validation");
        const result = humanNameSchema.safeParse(trimmed);
        if (!result.success)
          return {
            ok: false as const,
            message: `Invalid last name: ${result.error.errors[0]?.message}`,
          };
      }
      payload.last_name = trimmed;
    }
    if (data.phone !== undefined) {
      // Normalize Nigerian phone: 08012345678 → +2348012345678
      const raw = data.phone?.trim() || "";
      if (raw) {
        const digits = raw.replace(/[^0-9]/g, "");
        if (digits.startsWith("234") && digits.length >= 13) {
          payload.phone = `+${digits}`;
        } else if (digits.startsWith("0") && digits.length === 11) {
          payload.phone = `+234${digits.slice(1)}`;
        } else if (digits.length === 10) {
          payload.phone = `+234${digits}`;
        } else {
          payload.phone = raw;
        }
      } else {
        payload.phone = null;
      }
      // Server-side phone lock enforcement
      if (payload.phone) {
        const { validatePhoneWithLock } = await import("@/lib/validation");
        const phoneError = await validatePhoneWithLock(payload.phone);
        if (phoneError) {
          return { ok: false as const, message: phoneError };
        }
      }
    }
    if (data.state !== undefined) payload.state = data.state?.trim() || null;
    if (data.lga !== undefined) payload.lga = data.lga?.trim() || null;
    if (data.city !== undefined) payload.city = data.city?.trim() || null;
    if (data.address !== undefined) payload.address = data.address?.trim() || null;
    if (Object.keys(payload).length === 0) return { ok: true as const };
    const { error } = await db.from("customers").update(payload).eq("id", data.customer_id);
    if (error)
      return { ok: false as const, message: `Failed to update customer: ${error.message}` };
    logAudit("customer.update", "customer", data.customer_id, { fields: Object.keys(payload) });
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════
export const adminListTransactions = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("transactions.view");
    if (authError)
      return {
        transactions: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("payment_transactions")
      .select("*, orders(reference, email)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);
    if (data?.search) {
      query = query.or(
        `reference.ilike.%${data.search}%,paystack_reference.ilike.%${data.search}%`,
      );
    }
    const { data: transactions, count, error } = await query.range(from, to);
    if (error) throw new Error("Unable to load transactions. Please retry.");
    const total = count ?? 0;
    return {
      transactions: transactions ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

// ══════════════════════════════════════════════════════════════
// RECEIPTS
// ══════════════════════════════════════════════════════════════
export const adminListReceipts = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("receipts.view");
    if (authError)
      return {
        receipts: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("receipts")
      .select("*, orders(reference)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.search) {
      query = query.or(
        `receipt_number.ilike.%${data.search}%,customer_email.ilike.%${data.search}%`,
      );
    }
    const { data: receipts, count } = await query.range(from, to);
    const total = count ?? 0;
    return {
      receipts: receipts ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

// ══════════════════════════════════════════════════════════════
// MESSAGES (Contact form)
// ══════════════════════════════════════════════════════════════
export const adminListMessages = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        unread_only: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("messages.view");
    if (authError)
      return {
        messages: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.unread_only) query = query.eq("is_read", false);
    if (data?.search) {
      query = query.or(
        `name.ilike.%${data.search}%,email.ilike.%${data.search}%,subject.ilike.%${data.search}%`,
      );
    }
    const { data: messages, count } = await query.range(from, to);
    const total = count ?? 0;
    return {
      messages: messages ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const adminMarkMessageRead = createServerFn({ method: "POST" })
  .validator(z.object({ message_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("messages.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("messages").update({ is_read: true }).eq("id", data.message_id);
    if (error) return { ok: false as const, message: "Failed to mark message." };
    return { ok: true as const };
  });

export const adminDeleteMessage = createServerFn({ method: "POST" })
  .validator(z.object({ message_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("messages.manage", {
      auditOnDenial: true,
      context: "delete message",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("messages").delete().eq("id", data.message_id);
    if (error) return { ok: false as const, message: "Failed to delete message." };
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// NEWSLETTER SUBSCRIBERS
// ══════════════════════════════════════════════════════════════
export const adminListSubscribers = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.view");
    if (authError)
      return {
        subscribers: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("newsletter_subscribers")
      .select("*", { count: "exact" })
      .order("subscribed_at", { ascending: false });
    if (data?.search) query = query.ilike("email", `%${data.search}%`);
    const { data: subscribers, count } = await query.range(from, to);
    const total = count ?? 0;
    return {
      subscribers: subscribers ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const adminDeleteSubscriber = createServerFn({ method: "POST" })
  .validator(z.object({ subscriber_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("newsletter_subscribers").delete().eq("id", data.subscriber_id);
    if (error) return { ok: false as const, message: "Failed to remove subscriber." };
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════
export const adminListAuditLogs = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        category: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("audit.view");
    if (authError)
      return {
        logs: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.search) {
      query = query.or(`action.ilike.%${data.search}%,entity_type.ilike.%${data.search}%`);
    }
    // Server-side category filtering
    const category = data?.category || "all";
    if (category === "security") {
      query = query.or(
        "entity_type.eq.security,action.ilike.%unauthorized%,action.ilike.%permission_denied%",
      );
    } else if (category === "login") {
      query = query.in("action", ["admin_session_started", "admin_session_ended"]);
    } else if (category === "staff") {
      query = query.or("action.ilike.member.%,action.ilike.%role%");
    } else if (category === "system") {
      query = query.or(
        "action.ilike.%settings%,action.ilike.%product%,action.ilike.%category%,action.ilike.%hero%,action.ilike.%blog%",
      );
    } else if (category === "financial") {
      query = query.or(
        "action.ilike.%coupon%,action.ilike.%refund%,action.ilike.%order%,action.ilike.%payment%,action.ilike.%expense%",
      );
    }
    const { data: logs, count } = await query.range(from, to);
    const total = count ?? 0;
    return { logs: logs ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });

// AUDIT LOG RETENTION POLICY = OWNER APPROVED
// Owner has approved deletion of past audit logs with audit.delete permission.

/** Delete specific audit log entries (Owner-only with audit.delete permission) */
export const adminDeleteAuditLogs = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ids: z.array(z.number()).min(1).max(500), // Max 500 per batch
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("audit.delete");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Create deletion audit event FIRST (before deleting)
    logAudit("audit.delete", "audit_logs", undefined, {
      deleted_ids: data.ids,
      count: data.ids.length,
      timestamp: new Date().toISOString(),
    });
    // Delete the specified logs
    const { error, count } = await db.from("audit_logs").delete().in("id", data.ids);
    if (error) return { ok: false as const, message: `Delete failed: ${error.message}` };
    return { ok: true as const, deleted: count ?? 0 };
  });

/** Clear all audit logs before a specified date (Owner-only with audit.delete permission) */
export const adminClearAuditLogsBefore = createServerFn({ method: "POST" })
  .validator(
    z.object({
      before_date: z.string(), // ISO date string
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("audit.delete");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Create deletion audit event FIRST
    logAudit("audit.bulk_delete", "audit_logs", undefined, {
      before_date: data.before_date,
      timestamp: new Date().toISOString(),
    });
    // Delete logs before the specified date
    const { error, count } = await db
      .from("audit_logs")
      .delete()
      .lt("created_at", data.before_date);
    if (error) return { ok: false as const, message: `Clear failed: ${error.message}` };
    return { ok: true as const, deleted: count ?? 0 };
  });

// ══════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════
export const adminListCategoriesForDashboard = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("categories.manage");
    if (authError)
      return {
        ok: false as const,
        categories: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        message: authError,
      };
    const db = createDatabaseClient();
    return loadCategoryPage(data ?? {}, async ({ page, pageSize, search }) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = db
        .from("categories")
        .select("*, products(id)", { count: "exact" })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (search) query = query.ilike("name", `%${search}%`);
      return query.range(from, to);
    });
  });

export const adminCreateCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(100),
      slug: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      description: z.string().trim().max(500).optional(),
      icon: z.string().max(50).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("categories.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const result = await createCategoryRecord(data, async (category) =>
      db.from("categories").insert(category).select("*, products(id)").single(),
    );
    if (!result.ok) return result;
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("categories:list");
    await logAudit("category.create", "category", result.category.id, {
      name: result.category.name,
      slug: result.category.slug,
    });
    return result;
  });

export const adminUpdateCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      category_id: z.string().uuid(),
      name: z.string().trim().min(1).max(100).optional(),
      slug: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
        .optional(),
      description: z.string().trim().max(500).optional(),
      icon: z.string().trim().max(50).optional(),
      sort_order: z.number().int().min(0).max(1_000_000).optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("categories.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { category_id, ...updateData } = data;
    const result = await updateCategoryRecord(updateData, async (category) =>
      db
        .from("categories")
        .update(category)
        .eq("id", category_id)
        .select("*, products(id)")
        .maybeSingle(),
    );
    if (!result.ok) return result;
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("categories:list");
    await logAudit("category.update", "category", category_id, { changes: updateData });
    return result;
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .validator(z.object({ category_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("categories.manage", {
      auditOnDenial: true,
      context: "delete category",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Non-destructive guard: a category that still contains products must not
    // be permanently deleted. The FK is ON DELETE SET NULL (products survive
    // but silently lose their category), which the Owner experience treats as
    // an accident rather than an intended outcome. Archive/reassign needs an
    // Owner-approved migration — for now we block with the product count.
    const { count: productCount, error: countError } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.category_id);
    if (countError) return { ok: false as const, message: "Could not verify category usage." };
    if ((productCount ?? 0) > 0) {
      return {
        ok: false as const,
        message: `This category contains ${productCount} product${productCount === 1 ? "" : "s"} and cannot be deleted yet. Reassign its products first.`,
      };
    }
    const result = await deleteCategoryRecord(
      async () =>
        await db
          .from("categories")
          .delete()
          .eq("id", data.category_id)
          .select("*, products(id)")
          .maybeSingle(),
    );
    if (!result.ok) return result;
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("categories:list");
    await logAudit("category.delete", "category", data.category_id, {
      name: result.category.name,
      slug: result.category.slug,
    });
    return result;
  });

// ══════════════════════════════════════════════════════════════
// BLOG POSTS
// ══════════════════════════════════════════════════════════════
export const adminListBlogPosts = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("blog.manage");
    if (authError)
      return {
        posts: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("blog_posts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);
    if (data?.search)
      query = query.or(`title.ilike.%${data.search}%,category.ilike.%${data.search}%`);
    const { data: posts, count } = await query.range(from, to);
    const total = count ?? 0;
    return { posts: posts ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });

export const adminCreateBlogPost = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string().trim().min(1).max(300),
      excerpt: z.string().trim().max(500).optional(),
      content: z.string().trim().max(50000).optional(),
      category: z.string().trim().max(100).optional(),
      image: cloudinaryImageUrlSchema.optional(),
      youtube_url: z.string().max(2000).optional(),
      read_time: z.string().max(50).optional(),
      status: z.enum(["draft", "published", "archived"]).default("draft"),
      published_at: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("blog.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const sanitized = { ...data, title: data.title.trim(), slug: data.slug.toLowerCase().trim() };
    const { error } = await db.from("blog_posts").insert(sanitized);
    if (error) return { ok: false as const, message: "Failed to create blog post." };
    const { invalidateCachePrefix } = await import("@/lib/cache.server");
    invalidateCachePrefix("blog:posts:");
    return { ok: true as const };
  });

export const adminDeleteBlogPost = createServerFn({ method: "POST" })
  .validator(z.object({ post_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("blog.manage", {
      auditOnDenial: true,
      context: "delete blog post",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("blog_posts").delete().eq("id", data.post_id);
    if (error) return { ok: false as const, message: "Failed to delete blog post." };
    const { invalidateCachePrefix } = await import("@/lib/cache.server");
    invalidateCachePrefix("blog:posts:");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// HERO SLIDES
// ══════════════════════════════════════════════════════════════
export const adminListHeroSlides = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("hero.manage");
  if (authError) return { slides: [] as any[], error: authError };
  const db = createDatabaseClient();
  const { data: slides } = await db.from("hero_slides").select("*").order("sort_order");
  return { slides: slides ?? [] };
});

export const adminDeleteHeroSlide = createServerFn({ method: "POST" })
  .validator(z.object({ slide_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("hero.manage", {
      auditOnDenial: true,
      context: "delete hero slide",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("hero_slides").delete().eq("id", data.slide_id);
    if (error) return { ok: false as const, message: "Failed to delete slide." };
    logAudit("hero.delete", "hero", data.slide_id, {});
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("hero:slides");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// HERO SOURCE PICKERS — searchable lists for binding slides to a product or
// blog post. Only publicly visible records are offered (§1: never bind to
// deleted/archived/unpublished content). The slug doubles as the identity in
// the canonical cta_link, so no extra identity columns are needed.
// ══════════════════════════════════════════════════════════════
export const adminHeroProductOptions = createServerFn({ method: "GET" })
  .validator(z.object({ search: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("hero.manage");
    if (authError)
      return {
        options: [] as Array<{
          slug: string;
          name: string;
          sku: string;
          status: string;
          tagline: string;
          image: string;
        }>,
        error: authError,
      };
    const db = createDatabaseClient();
    let query = db
      .from("products")
      .select("slug, name, sku, status, tagline, product_images(secure_url, sort_order)")
      .eq("status", "active")
      .order("name")
      .limit(200);
    if (data?.search)
      query = query.or(
        `name.ilike.%${data.search}%,sku.ilike.%${data.search}%,slug.ilike.%${data.search}%`,
      );
    const { data: rows, error } = await query;
    if (error)
      return {
        options: [] as Array<{
          slug: string;
          name: string;
          sku: string;
          status: string;
          tagline: string;
          image: string;
        }>,
        error: error.message,
      };
    return {
      options: (rows ?? []).map(
        (row: {
          slug: string;
          name: string;
          sku: string;
          status: string;
          tagline: string | null;
          product_images: Array<{ secure_url: string; sort_order: number | null }>;
        }) => {
          const images = [...(row.product_images ?? [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          );
          return {
            slug: row.slug,
            name: row.name,
            sku: row.sku,
            status: row.status,
            tagline: row.tagline ?? "",
            image: images[0]?.secure_url ?? "",
          };
        },
      ),
    };
  });

export const adminHeroBlogOptions = createServerFn({ method: "GET" })
  .validator(z.object({ search: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("hero.manage");
    if (authError)
      return {
        options: [] as Array<{
          slug: string;
          title: string;
          status: string;
          kind: string;
          excerpt: string;
          image: string;
        }>,
        error: authError,
      };
    const db = createDatabaseClient();
    let query = db
      .from("blog_posts")
      .select("slug, title, status, youtube_url, excerpt, image")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(200);
    if (data?.search) query = query.or(`title.ilike.%${data.search}%`);
    const { data: rows, error } = await query;
    if (error)
      return {
        options: [] as Array<{
          slug: string;
          title: string;
          status: string;
          kind: string;
          excerpt: string;
          image: string;
        }>,
        error: error.message,
      };
    return {
      options: (rows ?? []).map(
        (row: {
          slug: string;
          title: string;
          status: string;
          youtube_url: string | null;
          excerpt: string | null;
          image: string | null;
        }) => ({
          slug: row.slug,
          title: row.title,
          status: row.status,
          kind: row.youtube_url ? "video" : "text",
          excerpt: row.excerpt ?? "",
          image: row.image ?? "",
        }),
      ),
    };
  });

// ══════════════════════════════════════════════════════════════
// TESTIMONIALS
// ══════════════════════════════════════════════════════════════
export const adminListTestimonials = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("testimonials.manage");
    if (authError)
      return {
        testimonials: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db.from("testimonials").select("*", { count: "exact" }).order("sort_order");
    if (data?.search) query = query.or(`name.ilike.%${data.search}%,role.ilike.%${data.search}%`);
    const { data: testimonials, count } = await query.range(from, to);
    const total = count ?? 0;
    return {
      testimonials: testimonials ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const adminDeleteTestimonial = createServerFn({ method: "POST" })
  .validator(z.object({ testimonial_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("testimonials.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("testimonials").delete().eq("id", data.testimonial_id);
    if (error) return { ok: false as const, message: "Failed to delete testimonial." };
    logAudit("testimonial.delete", "testimonial", data.testimonial_id, {});
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("testimonials:list");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SOCIAL LINKS
// ══════════════════════════════════════════════════════════════
export const adminListSocialLinks = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("social_links.manage");
  if (authError) return { links: [] as any[], error: authError };
  const db = createDatabaseClient();
  const { data: links } = await db.from("social_links").select("*").order("sort_order");
  return { links: links ?? [] };
});

export const adminDeleteSocialLink = createServerFn({ method: "POST" })
  .validator(z.object({ link_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("social_links.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("social_links").delete().eq("id", data.link_id);
    if (error) return { ok: false as const, message: "Failed to delete social link." };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("social:links");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SITE SETTINGS
// ══════════════════════════════════════════════════════════════
export const adminGetSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("settings.manage");
  if (authError) return { settings: {} as Record<string, string>, error: authError };
  const db = createDatabaseClient();
  const { data } = await db.from("site_settings").select("*");
  const settings: Record<string, string> = {};
  (data ?? []).forEach((s: any) => {
    settings[s.key] = s.value;
  });
  return { settings };
});

/**
 * Validate that a URL is a legitimate Google Maps URL.
 * Rejects: javascript:, data:, file:, arbitrary domains, HTML/script tags.
 */
function isValidGoogleMapsUrl(url: string): boolean {
  if (!url) return true; // empty is allowed (optional field)
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const parsed = new URL(trimmed);
    // Must be Google domains
    const allowedHosts = [
      "www.google.com",
      "google.com",
      "maps.google.com",
      "goo.gl",
      "maps.app.goo.gl",
    ];
    if (!allowedHosts.includes(parsed.hostname)) return false;
    // Reject if contains script/iframe/html injection attempts
    if (/<script|<iframe|javascript:|data:/i.test(trimmed)) return false;
    return true;
  } catch {
    return false;
  }
}

function isValidPublicWebsiteUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export const adminUpdateSiteSettings = createServerFn({ method: "POST" })
  .validator(z.object({ settings: z.record(z.string()) }))
  .handler(async ({ data }) => updateSiteSettings(data));

export const updateSiteSettings = createServerOnlyFn(async (input: unknown) => {
  const data = z.object({ settings: z.record(z.string()) }).parse(input);
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("settings.manage");
  if (authError) return { ok: false as const, message: authError };

  // Validate Google Maps URLs if provided
  const embedUrl = data.settings.google_maps_embed_url?.trim() || "";
  const directionsUrl = data.settings.google_maps_directions_url?.trim() || "";
  if (embedUrl && !isValidGoogleMapsUrl(embedUrl)) {
    return { ok: false as const, message: "Please enter a valid Google Maps embed URL." };
  }
  if (directionsUrl && !isValidGoogleMapsUrl(directionsUrl)) {
    return { ok: false as const, message: "Please enter a valid Google Maps directions URL." };
  }
  const websiteUrl = data.settings.website_url?.trim() || "";
  if (websiteUrl && !isValidPublicWebsiteUrl(websiteUrl)) {
    return { ok: false as const, message: "Please enter a valid HTTPS website URL." };
  }

  // Validate delivery fee settings
  const deliveryFee = data.settings.delivery_fee;
  const freeDeliveryEnabled = data.settings.free_delivery_enabled;
  const freeThreshold = data.settings.free_delivery_threshold;
  if (
    freeDeliveryEnabled !== undefined &&
    freeDeliveryEnabled !== "true" &&
    freeDeliveryEnabled !== "false"
  ) {
    return { ok: false as const, message: "Free delivery must be enabled or disabled." };
  }
  if (deliveryFee !== undefined && deliveryFee !== "") {
    const fee = Number(deliveryFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000000 || !Number.isInteger(fee)) {
      return {
        ok: false as const,
        message: "Delivery fee must be a valid non-negative whole number (max ₦1,000,000).",
      };
    }
  }
  if (freeThreshold !== undefined && freeThreshold !== "") {
    const threshold = Number(freeThreshold);
    if (
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 100000000 ||
      !Number.isInteger(threshold)
    ) {
      return {
        ok: false as const,
        message:
          "Free delivery threshold must be a valid non-negative whole number (max ₦100,000,000).",
      };
    }
  }

  // Inventory alert settings (distinct from free-delivery threshold)
  const lowStockAlerts = data.settings.low_stock_alerts_enabled;
  if (lowStockAlerts !== undefined && lowStockAlerts !== "true" && lowStockAlerts !== "false") {
    return { ok: false as const, message: "Low stock alerts must be enabled or disabled." };
  }
  const lowStockDefault = data.settings.low_stock_threshold_default;
  if (lowStockDefault !== undefined) {
    const value = Number(lowStockDefault);
    if (
      !lowStockDefault.trim() ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1_000_000 ||
      !Number.isInteger(value)
    ) {
      return {
        ok: false as const,
        message:
          "Default low stock threshold must be a valid non-negative whole number (max 1,000,000).",
      };
    }
  }

  const db = createDatabaseClient();
  const rows = Object.entries(data.settings).map(([key, value]) => ({
    key,
    value: value?.trim() || "",
  }));
  const { error } = await db.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false as const, message: "Failed to save settings." };
  logAudit("settings.update", "settings", undefined, { keys: Object.keys(data.settings) });
  const { invalidateCache } = await import("@/lib/cache.server");
  invalidateCache("site:settings");
  return { ok: true as const };
});

// ══════════════════════════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════════════════════════
export const adminListInventory = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().trim().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("inventory.view");
    if (authError)
      return {
        items: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("inventory")
      .select(
        "*, products(id, name, sku, slug, in_stock, product_images(secure_url, sort_order))",
        { count: "exact" },
      )
      .order("quantity", { ascending: true });
    if (data?.search) {
      query = query.or(`products.name.ilike.%${data.search}%,products.sku.ilike.%${data.search}%`);
    }
    const { data: items, count, error } = await query.range(from, to);
    const result = resolveInventoryPage({ page, pageSize }, { data: items, count, error });
    if (!result.ok) {
      console.error("[adminListInventory] Query failed:", error?.message ?? "unknown error");
      return {
        ...result,
        error: result.message,
      };
    }
    return result;
  });

export const adminUpdateInventory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().min(0).max(1_000_000),
      low_stock_threshold: z.number().int().min(0).max(1_000_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("inventory.edit");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { data: previous, error: previousError } = await db
      .from("inventory")
      .select("product_id, quantity, reserved, low_stock_threshold")
      .eq("product_id", data.product_id)
      .maybeSingle();
    if (previousError) {
      return { ok: false as const, message: "Inventory could not be verified. Please retry." };
    }
    if (!previous) return { ok: false as const, message: "Inventory record not found." };

    if (data.quantity < (previous.reserved ?? 0))
      return { ok: false as const, message: "Stock cannot be lower than reserved units." };
    const updatePayload: { quantity: number; low_stock_threshold?: number } = {
      quantity: data.quantity,
    };
    if (data.low_stock_threshold !== undefined)
      updatePayload.low_stock_threshold = data.low_stock_threshold;
    const { data: updated, error } = await db
      .from("inventory")
      .update(updatePayload)
      .eq("product_id", data.product_id)
      .eq("quantity", previous.quantity)
      .select("product_id, quantity, reserved, low_stock_threshold")
      .maybeSingle();
    const confirmed = confirmInventoryUpdate({ data: updated, error });
    if (!confirmed.ok) return confirmed;
    await logAudit("inventory.update", "inventory", data.product_id, {
      product_id: data.product_id,
      previous_quantity: previous.quantity,
      quantity: data.quantity,
    });

    const { data: product } = await db
      .from("products")
      .select("name")
      .eq("id", data.product_id)
      .maybeSingle();
    const { emitLowStockTransition } = await import("../inventory-settings.server");
    await emitLowStockTransition(
      db,
      { id: data.product_id, name: product?.name || data.product_id },
      previous,
      confirmed.inventory,
    );

    return confirmed;
  });

// ══════════════════════════════════════════════════════════════
// COUPONS
// ══════════════════════════════════════════════════════════════
export const adminListCoupons = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("coupons.manage");
    if (authError)
      return {
        coupons: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("coupons")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.search) query = query.ilike("code", `%${data.search}%`);
    const pageResult = await loadCouponPage({ page, pageSize, search: data?.search }, async () => {
      const { data: coupons, count, error } = await query.range(from, to);
      return { data: coupons, count, error };
    });
    if (!pageResult.ok) return { ...pageResult, error: pageResult.message };
    return pageResult;
  });

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `DIP${suffix}`;
}

export const adminGenerateCouponCode = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("coupons.manage", {
    auditOnDenial: true,
    context: "generate coupon code",
  });
  if (authError) return { code: "", error: authError };
  const db = createDatabaseClient();
  let code = generateCouponCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await db.from("coupons").select("code").eq("code", code).single();
    if (!data) break;
    code = generateCouponCode();
  }
  return { code };
});

export const adminCreateCoupon = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z
        .string()
        .trim()
        .min(3)
        .max(50)
        .regex(/^[A-Za-z0-9]+$/),
      discount_type: z.enum(["percentage", "fixed"]),
      discount_value: z.number().gt(0).max(1000000),
      max_uses: z.number().int().min(1).default(1),
      starts_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      expires_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("coupons.manage", {
      auditOnDenial: true,
      context: "create coupon",
    });
    if (authError) return { ok: false as const, message: authError };
    if (data.discount_type === "percentage" && data.discount_value > 100)
      return { ok: false as const, message: "Percentage discount cannot exceed 100%." };
    if (!normalizeCouponDateRange(data).valid) {
      return { ok: false as const, message: "Expiry date must be after start date." };
    }
    const db = createDatabaseClient();
    const created = await createCouponRecord(
      data,
      async (normalizedCode) => {
        const { data: candidates, error } = await db
          .from("coupons")
          .select("id, code")
          .ilike("code", normalizedCode)
          .limit(20);
        return { data: candidates, error };
      },
      async (coupon) => {
        const { data: inserted, error } = await db
          .from("coupons")
          .insert(coupon)
          .select("*")
          .single();
        return { data: inserted, error };
      },
    );
    if (!created.ok) return created;
    logAudit("coupon.create", "coupon", undefined, {
      code: created.coupon.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
    });
    return { ok: true as const, coupon: created.coupon };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .validator(z.object({ coupon_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("coupons.manage", {
      auditOnDenial: true,
      context: "delete coupon",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { data: deleted, error } = await db
      .from("coupons")
      .delete()
      .eq("id", data.coupon_id)
      .select("*")
      .maybeSingle();
    const deletion = confirmCouponMutation("delete", { data: deleted, error });
    if (!deletion.ok) return deletion;
    logAudit("coupon.delete", "coupon", data.coupon_id, {});
    return deletion;
  });

export const adminUpdateCoupon = createServerFn({ method: "POST" })
  .validator(
    z.object({
      coupon_id: z.string().uuid(),
      code: z
        .string()
        .trim()
        .min(3)
        .max(50)
        .regex(/^[A-Za-z0-9]+$/)
        .optional(),
      discount_type: z.enum(["percentage", "fixed"]).optional(),
      discount_value: z.number().gt(0).max(1000000).optional(),
      max_uses: z.number().int().min(1).optional(),
      starts_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .nullable(),
      expires_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .nullable(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("coupons.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { data: currentCoupon, error: currentError } = await db
      .from("coupons")
      .select("*")
      .eq("id", data.coupon_id)
      .maybeSingle();
    if (currentError)
      return { ok: false as const, message: "Coupon could not be loaded for update." };
    if (!currentCoupon) return { ok: false as const, message: "Coupon not found." };

    const nextType = data.discount_type ?? currentCoupon.discount_type;
    const nextValue = data.discount_value ?? Number(currentCoupon.discount_value);
    if (nextType === "percentage" && nextValue > 100) {
      return { ok: false as const, message: "Percentage discount cannot exceed 100%." };
    }
    if (data.max_uses !== undefined && data.max_uses < Number(currentCoupon.uses ?? 0)) {
      return { ok: false as const, message: "Maximum uses cannot be below current usage." };
    }
    const dateRange = normalizeCouponDateRange({
      starts_at: data.starts_at === undefined ? currentCoupon.starts_at : data.starts_at,
      expires_at: data.expires_at === undefined ? currentCoupon.expires_at : data.expires_at,
    });
    if (!dateRange.valid) {
      return { ok: false as const, message: "Expiry date must be after start date." };
    }
    const updatePayload: Record<string, string | number | boolean | null> = {};
    if (data.code !== undefined) {
      const normalizedCode = normalizeCouponCode(data.code);
      // Check uniqueness excluding this coupon
      const { data: candidates, error: uniquenessError } = await db
        .from("coupons")
        .select("id, code")
        .ilike("code", normalizedCode)
        .neq("id", data.coupon_id)
        .limit(20);
      if (uniquenessError)
        return { ok: false as const, message: "Coupon uniqueness could not be verified." };
      if (
        (candidates ?? []).some((candidate) =>
          couponCodesEquivalent(candidate.code, normalizedCode),
        )
      )
        return { ok: false as const, message: "A coupon with this code already exists." };
      updatePayload.code = normalizedCode;
    }
    if (data.discount_type !== undefined) updatePayload.discount_type = data.discount_type;
    if (data.discount_value !== undefined) updatePayload.discount_value = data.discount_value;
    if (data.max_uses !== undefined) updatePayload.max_uses = data.max_uses;
    if (data.starts_at !== undefined) updatePayload.starts_at = dateRange.starts_at;
    if (data.expires_at !== undefined) updatePayload.expires_at = dateRange.expires_at;
    if (data.active !== undefined) updatePayload.active = data.active;
    if (Object.keys(updatePayload).length === 0)
      return { ok: false as const, message: "No coupon changes were provided." };
    const { data: updated, error } = await db
      .from("coupons")
      .update(updatePayload)
      .eq("id", data.coupon_id)
      .select("*")
      .maybeSingle();
    if (error?.code === "23505" || (error && /duplicate|unique/i.test(error.message))) {
      return { ok: false as const, message: "A coupon with this code already exists." };
    }
    const mutation = confirmCouponMutation("update", { data: updated, error });
    if (!mutation.ok) return mutation;
    logAudit("coupon.update", "coupon", data.coupon_id, updatePayload);
    return mutation;
  });

// ══════════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW STATS
// ══════════════════════════════════════════════════════════════
export const adminGetDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("analytics.view");
  if (authError) return { stats: null, error: authError };
  const db = createDatabaseClient();

  // Parallelize all independent queries for dramatically faster dashboard load
  const [
    revenueResult,
    totalOrdersResult,
    pendingOrdersResult,
    paidOrdersCountResult,
    processingOrdersResult,
    shippedOrdersResult,
    deliveredOrdersResult,
    totalCustomersResult,
    totalProductsResult,
    activeProductsResult,
    lowStockResult,
    recentOrdersResult,
    totalReviewsResult,
    pendingReviewsResult,
    totalMessagesResult,
    unreadMessagesResult,
    totalSubscribersResult,
  ] = await Promise.all([
    // Revenue from paid orders
    db.from("orders").select("total").in("status", ["paid", "processing", "shipped", "delivered"]),
    // Order counts by status (single query with group would be ideal but Supabase lacks it)
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "processing"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "shipped"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "delivered"),
    // Customer count
    db.from("customers").select("id", { count: "exact", head: true }),
    // Product counts
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
    // Low stock
    db.from("inventory").select("quantity, low_stock_threshold"),
    // Recent orders
    db
      .from("orders")
      .select(
        "id, reference, email, status, total, created_at, customers(first_name, last_name), order_items(id)",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    // Reviews
    db.from("reviews").select("id", { count: "exact", head: true }),
    db.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Messages
    db.from("messages").select("id", { count: "exact", head: true }),
    db.from("messages").select("id", { count: "exact", head: true }).eq("is_read", false),
    // Subscribers
    db.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
  ]);

  const totalRevenue = (revenueResult.data ?? []).reduce(
    (sum: number, o: any) => sum + Number(o.total),
    0,
  );
  const lowStockCount = (lowStockResult.data ?? []).filter(
    (i: any) => i.quantity <= i.low_stock_threshold,
  ).length;

  return {
    stats: {
      totalRevenue,
      totalOrders: totalOrdersResult.count ?? 0,
      pendingOrders: pendingOrdersResult.count ?? 0,
      paidOrders: paidOrdersCountResult.count ?? 0,
      processingOrders: processingOrdersResult.count ?? 0,
      shippedOrders: shippedOrdersResult.count ?? 0,
      deliveredOrders: deliveredOrdersResult.count ?? 0,
      totalCustomers: totalCustomersResult.count ?? 0,
      totalProducts: totalProductsResult.count ?? 0,
      activeProducts: activeProductsResult.count ?? 0,
      lowStockCount,
      recentOrders: recentOrdersResult.data ?? [],
      totalReviews: totalReviewsResult.count ?? 0,
      pendingReviews: pendingReviewsResult.count ?? 0,
      totalMessages: totalMessagesResult.count ?? 0,
      unreadMessages: unreadMessagesResult.count ?? 0,
      totalSubscribers: totalSubscribersResult.count ?? 0,
    },
  };
});

// ══════════════════════════════════════════════════════════════
// INTEGRATIONS STATUS
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ANALYTICS CHART DATA
// ══════════════════════════════════════════════════════════════
export const adminGetAnalyticsData = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("products.view");
  if (authError) return { data: null, error: authError };
  const db = createDatabaseClient();

  const now = new Date();
  // Date range: 12 months ago to end of current month
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Fetch ALL data in parallel (4 queries instead of 22+)
  const [allPaidOrders, orderItemsResult, auditResult, lowStockResult] = await Promise.all([
    db
      .from("orders")
      .select("total, created_at")
      .in("status", ["paid", "processing", "shipped", "delivered"])
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd),
    db
      .from("order_items")
      .select(
        "product_id, name, quantity, line_total, orders!inner(status), products!inner(name, category_id, categories(name))",
      )
      .not("product_id", "is", null)
      .in("orders.status", ["paid", "processing", "shipped", "delivered"]),
    db
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("inventory")
      .select("quantity, reserved, low_stock_threshold, products(name)")
      .order("quantity", { ascending: true })
      .limit(1000),
  ]);

  // Compute monthly aggregates in JS
  const months: { month: string; revenue: number; orders: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toLocaleDateString("en-NG", { month: "short" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const monthOrders = (allPaidOrders.data ?? []).filter(
      (o: any) => o.created_at >= monthStart && o.created_at <= monthEnd,
    );
    months.push({
      month: monthKey,
      revenue: monthOrders.reduce((s: number, o: any) => s + Number(o.total), 0),
      orders: monthOrders.length,
    });
  }

  // Compute weekly aggregates in JS
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekly: { day: string; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    const dayOrders = (allPaidOrders.data ?? []).filter(
      (o: any) => o.created_at >= dayStart && o.created_at <= dayEnd,
    );
    weekly.push({
      day: dayNames[i],
      revenue: dayOrders.reduce((s: number, o: any) => s + Number(o.total), 0),
    });
  }

  // Top products
  const productMap: Record<
    string,
    { name: string; category: string; qty: number; revenue: number }
  > = {};
  (orderItemsResult.data ?? []).forEach((item: any) => {
    const pid = item.product_id;
    if (!productMap[pid]) {
      productMap[pid] = {
        name: item.name || item.products?.name || "Unknown",
        category: item.products?.categories?.name || "—",
        qty: 0,
        revenue: 0,
      };
    }
    productMap[pid].qty += item.quantity;
    productMap[pid].revenue += Number(item.line_total || 0);
  });
  const topProducts = Object.entries(productMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(([id, p], i) => ({ id, rank: i + 1, ...p }));

  return {
    data: {
      monthlySales: months,
      weeklyRevenue: weekly,
      topProducts,
      recentActivity: auditResult.data ?? [],
      lowStockProducts: (lowStockResult.data ?? [])
        .filter((i) => resolveInventoryState(i, false).state === "low_stock")
        .slice(0, 5)
        .map((i: any) => ({
          name: i.products?.name || "Unknown",
          stock: i.quantity,
          threshold: i.low_stock_threshold,
        })),
    },
  };
});

// ══════════════════════════════════════════════════════════════
// REFUNDS
// ══════════════════════════════════════════════════════════════
export const adminInitiateRefund = createServerFn({ method: "POST" })
  .validator(
    z.object({
      transaction_id: z.string().uuid(),
      amount: z.number().min(1).optional(),
      reason: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("products.create");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();

    const { data: tx } = await db
      .from("payment_transactions")
      .select("*")
      .eq("id", data.transaction_id)
      .single();
    if (!tx) return { ok: false as const, message: "Transaction not found." };
    if (tx.status !== "successful")
      return { ok: false as const, message: "Can only refund successful transactions." };

    try {
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY?.trim();
      if (!PAYSTACK_SECRET_KEY) return { ok: false as const, message: "Paystack not configured." };

      const refundAmount = data.amount
        ? Math.round(data.amount * 100)
        : Math.round(Number(tx.amount) * 100);
      const res = await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction: tx.paystack_reference,
          amount: refundAmount,
          note: data.reason || "Admin refund",
        }),
      });
      const result = await res.json();
      if (!result.status)
        return { ok: false as const, message: result.message || "Paystack refund failed." };

      // Provider-authoritative refund semantics:
      // The Create-Refund API response is an ACKNOWLEDGEMENT, not completion.
      // The canonical refund state is recorded from the provider refund object
      // via the shared idempotent lifecycle (same path as refund.* webhooks),
      // so admin UI, webhooks, and provider state can never disagree.
      // No receipt row is written here: receipts are successful-payment
      // financial receipts only; refund documents render from transaction state.
      const { applyRefundLifecycleEvent } = await import("../refund-lifecycle.server");
      const initialStatus = result.data?.status as string | undefined;
      const lifecycleStatus =
        initialStatus === "processed"
          ? "refund.processed"
          : initialStatus === "failed"
            ? "refund.failed"
            : initialStatus === "processing"
              ? "refund.processing"
              : "refund.pending";
      const lifecycle = await applyRefundLifecycleEvent(lifecycleStatus, {
        id: result.data?.id,
        transaction_reference: tx.paystack_reference,
        amount: result.data?.amount,
        currency: result.data?.currency,
        note: data.reason,
      });
      if (!lifecycle.ok) {
        return {
          ok: false as const,
          message: `Refund ${result.data?.status ?? "created"} at Paystack, but recording state failed: ${lifecycle.message}`,
        };
      }

      return { ok: true as const, message: `Refund ${lifecycle.message.toLowerCase()}.` };
    } catch (err) {
      console.error("[refund] Error:", err);
      return { ok: false as const, message: "Refund processing failed." };
    }
  });

// ══════════════════════════════════════════════════════════════
// CLOUDINARY MEDIA
// ══════════════════════════════════════════════════════════════
export const adminListMedia = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        folder: z.string().optional(),
        // Cloudinary cursor pagination (§10): never fetch the whole collection.
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("products.edit");
    if (authError)
      return { assets: [] as any[], nextCursor: null as string | null, error: authError };
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !apiKey || !apiSecret)
      return { assets: [], nextCursor: null, error: "Cloudinary not configured." };
    try {
      const { v2: cloudinary } = await import("cloudinary");
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      const folder = data?.folder || "diplomat-global";
      // Reverse-chronological (newest first) — stable across pages.
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: folder + "/",
        max_results: data?.pageSize ?? 30,
        ...(data?.cursor ? { next_cursor: data.cursor } : {}),
        ...(data?.search ? { context: "alt=" + data.search } : {}),
      });
      return {
        assets: result.resources || [],
        nextCursor: result.next_cursor ?? null,
      };
    } catch (err: any) {
      console.error("[media] List failed:", err.message);
      return { assets: [], nextCursor: null, error: err.message };
    }
  });

export const adminDeleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ public_id: z.string() }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("products.archive", {
      auditOnDenial: true,
      context: "delete product",
    });
    if (authError) return { ok: false as const, message: authError };
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !apiKey || !apiSecret)
      return { ok: false as const, message: "Cloudinary not configured." };
    try {
      const { v2: cloudinary } = await import("cloudinary");
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      await cloudinary.uploader.destroy(data.public_id);
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, message: err.message || "Delete failed." };
    }
  });

// ══════════════════════════════════════════════════════════════
// SITE PAGES
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// MEMBERS / RBAC
// ══════════════════════════════════════════════════════════════
const ROLE_DEFINITIONS = [
  {
    id: "owner",
    name: "Owner",
    description: "Full system access. Can manage staff, refunds, integrations, and all settings.",
  },
  {
    id: "admin",
    name: "Administrator",
    description:
      "Broad access to most features. Cannot manage other administrators or system secrets.",
  },
  {
    id: "sales_manager",
    name: "Sales Manager",
    description: "Access to sales analytics, products, customers, orders, and sales team data.",
  },
  {
    id: "sales_rep",
    name: "Sales Representative",
    description:
      "View products, customers, orders. Update approved workflow states. No financial access.",
  },
  {
    id: "finance",
    name: "Finance",
    description: "Access payments, transactions, receipts, refunds, and financial analytics.",
  },
  {
    id: "editor",
    name: "Content Editor",
    description:
      "Edit blog, hero slides, testimonials, pages, media. No financial or system access.",
  },
  {
    id: "support",
    name: "Support",
    description: "View orders, customers, messages. No refunds or system access.",
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to permitted areas. Cannot modify any data.",
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: [
    "products:*",
    "orders:*",
    "customers:*",
    "content:*",
    "payments:read",
    "reviews:*",
    "messages:*",
    "newsletter:*",
    "inventory:*",
    "coupons:*",
  ],
  sales_manager: ["products:read", "orders:*", "customers:*", "reviews:read", "analytics:read"],
  sales_rep: ["products:read", "orders:read", "customers:read"],
  finance: ["payments:*", "transactions:*", "receipts:*", "refunds:*", "analytics:read"],
  editor: ["content:*", "media:*", "blog:*", "hero-slides:*", "testimonials:*", "pages:*"],
  support: ["orders:read", "customers:read", "messages:*"],
  viewer: ["products:read", "orders:read", "customers:read"],
};

export const adminListMembers = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("staff.manage");
    if (authError)
      return {
        members: [] as any[],
        roles: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const [membersResult, rolesResult] = await Promise.all([
      db
        .from("admin_users")
        .select("*, roles(key, name, description)", { count: "exact" })
        .order("created_at")
        .range(from, to),
      db.from("roles").select("id, key, name, description").order("name"),
    ]);
    const total = membersResult.count ?? 0;
    return {
      members: membersResult.data ?? [],
      roles: rolesResult.data ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

export const adminGetRoles = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("staff.manage");
  if (authError) return { roles: [], permissions: {}, error: authError };
  const db = createDatabaseClient();
  // Read roles from DB with their permissions
  const { data: roles } = await db
    .from("roles")
    .select("id, key, name, description, is_system")
    .order("name");
  const rolePermissions: Record<string, string[]> = {};
  for (const role of roles || []) {
    const { data: perms } = await db
      .from("role_permissions")
      .select("permissions!inner(key)")
      .eq("role_id", role.id);
    rolePermissions[role.id] = (perms || []).map((p: any) => p.permissions?.key).filter(Boolean);
  }
  return { roles: roles ?? [], permissions: rolePermissions };
});

export const adminGetAllPermissions = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("staff.manage");
  if (authError) return { permissions: [], error: authError };
  const db = createDatabaseClient();
  const { data: perms } = await db
    .from("permissions")
    .select("id, key, name, description")
    .order("key");
  return { permissions: perms ?? [] };
});

export const adminUpdateMemberRole = createServerFn({ method: "POST" })
  .validator(z.object({ member_id: z.string().uuid(), role: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner, logAudit } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Look up the role from the roles table by UUID (UI sends role.id)
    const { data: roleRow } = await db.from("roles").select("id, key").eq("id", data.role).single();
    if (!roleRow) return { ok: false as const, message: "Invalid role." };
    // Protect Owner from demotion (check via role_id → roles.key)
    const { data: target } = await db
      .from("admin_users")
      .select("role_id")
      .eq("id", data.member_id)
      .single();
    if (target?.role_id) {
      const { data: targetRole } = await db
        .from("roles")
        .select("key")
        .eq("id", target.role_id)
        .single();
      if (targetRole?.key === "owner" && roleRow.key !== "owner")
        return { ok: false as const, message: "Cannot demote the Owner." };
    }
    const { error } = await db
      .from("admin_users")
      .update({ role_id: roleRow.id })
      .eq("id", data.member_id);
    if (error) return { ok: false as const, message: "Failed to update role." };
    logAudit("member.role_change", "member", data.member_id, { new_role: roleRow.key });
    return { ok: true as const };
  });

export const adminToggleMemberActive = createServerFn({ method: "POST" })
  .validator(z.object({ member_id: z.string().uuid(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner, logAudit } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Protect Owner from deactivation (check via role_id → roles.key)
    const { data: target } = await db
      .from("admin_users")
      .select("role_id")
      .eq("id", data.member_id)
      .single();
    if (target?.role_id) {
      const { data: targetRole } = await db
        .from("roles")
        .select("key")
        .eq("id", target.role_id)
        .single();
      if (targetRole?.key === "owner" && !data.active)
        return { ok: false as const, message: "Cannot deactivate the Owner." };
    }
    const { error } = await db
      .from("admin_users")
      .update({ active: data.active })
      .eq("id", data.member_id);
    if (error) return { ok: false as const, message: "Failed to update member status." };
    logAudit("member.deactivate", "member", data.member_id, { active: data.active });
    // Notification for staff deactivation
    if (!data.active) {
      try {
        const { notifications } = await import("@/lib/notifications");
        // Fetch email for the notification
        const { data: memberData } = await db
          .from("admin_users")
          .select("email")
          .eq("id", data.member_id)
          .single();
        if (memberData?.email) await notifications.staffDeactivated(memberData.email);
      } catch (_) {}
    }
    return { ok: true as const };
  });

export const adminDeleteMember = createServerFn({ method: "POST" })
  .validator(z.object({ member_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner, logAudit } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Protect Owner from deletion
    const { data: target } = await db
      .from("admin_users")
      .select("role_id")
      .eq("id", data.member_id)
      .single();
    if (target?.role_id) {
      const { data: targetRole } = await db
        .from("roles")
        .select("key")
        .eq("id", target.role_id)
        .single();
      if (targetRole?.key === "owner")
        return { ok: false as const, message: "Cannot delete the Owner." };
    }
    // Remove Clerk association and deactivate — blocks access unless re-invited
    const { error } = await db
      .from("admin_users")
      .update({ clerk_user_id: null, active: false })
      .eq("id", data.member_id);
    if (error) return { ok: false as const, message: "Failed to remove member access." };
    logAudit("member.delete", "member", data.member_id, { action: "removed_access" });
    // Create notification for staff access removal
    try {
      const { notifications } = await import("@/lib/notifications");
      // Get email for notification
      const { data: memberData } = await db
        .from("admin_users")
        .select("email")
        .eq("id", data.member_id)
        .single();
      await notifications.staffAccessRemoved(memberData?.email || "unknown");
    } catch (err) {
      // Notification failure must not fail the operation
    }
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// STAFF INVITATION
// ══════════════════════════════════════════════════════════════
export const adminInviteStaff = createServerFn({ method: "POST" })
  .validator(
    z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.string().uuid() }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner, logAudit } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Look up role_id from roles table
    const { data: roleRow } = await db.from("roles").select("id, key").eq("id", data.role).single();
    if (!roleRow) return { ok: false as const, message: "Invalid role selected." };
    // Block Owner role invitation — Owner must only be created via bootstrap
    if (roleRow.key === "owner") {
      return {
        ok: false as const,
        message: "Cannot invite as Owner. Owner provisioning is restricted to the bootstrap flow.",
      };
    }
    // Normalize email and check for existing rows (any status)
    const normalizedEmail = data.email.toLowerCase().trim();
    const { data: existingAny } = await db
      .from("admin_users")
      .select("id, active, clerk_user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (existingAny) {
      if (existingAny.active && existingAny.clerk_user_id) {
        return { ok: false as const, message: "This email is already an active admin user." };
      }
      return { ok: false as const, message: "This email already has a pending invitation." };
    }
    // Attempt to send a real Clerk invitation email BEFORE creating any DB row.
    // If Clerk fails, we STOP — no orphan pending admin_users row is created.
    let clerkInvitationAccepted = false;
    const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
    if (clerkSecretKey) {
      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
        const invitation = await clerkClient.invitations.createInvitation({
          emailAddress: normalizedEmail,
          redirectUrl:
            (import.meta.env.VITE_SITE_URL || "https://diplomatglobal.com").replace(/\/$/, "") +
            "/admin/login",
          publicMetadata: { role_id: roleRow.id, role_key: roleRow.key },
        });
        clerkInvitationAccepted = invitation.status === "pending";
      } catch (clerkErr: any) {
        const msg = clerkErr?.errors?.[0]?.message || clerkErr?.message || "";
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes("duplicate") || lowerMsg.includes("already exists")) {
          // The invitation already exists in Clerk — safe to proceed to DB provisioning
          clerkInvitationAccepted = true;
        } else if (
          lowerMsg.includes("taken") ||
          lowerMsg.includes("already a user") ||
          lowerMsg.includes("email address exists") ||
          lowerMsg.includes("already registered") ||
          lowerMsg.includes("already associated") ||
          lowerMsg.includes("already a member") ||
          lowerMsg.includes("belongs to another") ||
          lowerMsg.includes("in use")
        ) {
          // Email is already a Clerk user — resolve and link them as admin
          try {
            const { createClerkClient: createClerkClient2 } = await import("@clerk/backend");
            const clerkClient2 = createClerkClient2({ secretKey: clerkSecretKey });
            const users = await clerkClient2.users.getUserList({ emailAddress: [normalizedEmail] });
            const clerkUser = users.data?.[0];
            if (clerkUser?.id) {
              // SECURITY: Explicitly verify the email is verified in Clerk
              const matchingEmail = clerkUser.emailAddresses?.find(
                (e: any) => e.emailAddress?.toLowerCase().trim() === normalizedEmail,
              );
              if (!matchingEmail) {
                return {
                  ok: false as const,
                  message: "Could not match the email address in this Clerk account.",
                };
              }
              if (matchingEmail.verification?.status !== "verified") {
                return {
                  ok: false as const,
                  message:
                    "This email address is not yet verified in Clerk. The user must verify their email first.",
                };
              }
              // Also reject if this is the Owner account
              if (roleRow.key === "owner") {
                return {
                  ok: false as const,
                  message: "Cannot invite or link an Owner account through this flow.",
                };
              }
              // Create admin_users row linked to existing Clerk user
              const { error: linkErr } = await db.from("admin_users").insert({
                clerk_user_id: clerkUser.id,
                email: normalizedEmail,
                role_id: roleRow.id,
                active: true,
              });
              if (linkErr) {
                if (linkErr.code === "23505") {
                  return { ok: false as const, message: "This email is already an admin user." };
                }
                return { ok: false as const, message: `Failed to add staff: ${linkErr.message}` };
              }
              logAudit("member.add_existing_clerk", "member", undefined, {
                email: normalizedEmail,
                role: roleRow.key,
                clerk_user_id: clerkUser.id,
              });
              return {
                ok: true as const,
                message: `${normalizedEmail} is now an active ${roleRow.key}. They can sign in directly with their existing account.`,
              };
            }
          } catch (resolveErr: any) {
            console.error("[staff-invite] Failed to resolve Clerk user:", resolveErr);
          }
          // Fallback: couldn't resolve — tell owner to invite separately
          return {
            ok: false as const,
            message: `This email is already a Clerk user but could not be resolved. They should sign in first, then you can assign their role from the Staff page.`,
          };
        } else {
          // Clerk failed for a non-duplicate reason — STOP, do NOT create a DB row
          console.error("[staff-invite] Clerk invitation failed:", msg);
          logAudit("member.invite.failed", "member", undefined, {
            email: normalizedEmail,
            role: roleRow.key,
            error: msg,
          });
          return {
            ok: false as const,
            message: `Clerk invitation failed: ${msg || "Unknown error"}. No invitation was created.`,
          };
        }
      }
    } else {
      // Clerk is NOT configured — a Supabase pending row alone is NOT an invitation.
      // A pending row without Clerk delivery means the invitee will never receive an email.
      // Refuse to create an unusable orphan row.
      logAudit("member.invite.failed", "member", undefined, {
        email: normalizedEmail,
        role: roleRow.key,
        error: "Clerk provider not configured",
      });
      return {
        ok: false as const,
        message:
          "Staff invitation requires Clerk. Clerk provider is not configured. No invitation was created.",
      };
    }
    // Only create the pending admin_users row AFTER Clerk invitation succeeds.
    const { error } = await db.from("admin_users").insert({
      clerk_user_id: null,
      email: normalizedEmail,
      role_id: roleRow.id,
      active: false,
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false as const,
          message: "This email already has a pending invitation or is an existing admin.",
        };
      }
      // DB failed after Clerk succeeded — partial failure, report clearly
      console.error(
        "[staff-invite] Clerk invitation succeeded but DB insert failed:",
        error.message,
      );
      logAudit("member.invite.partial", "member", undefined, {
        email: normalizedEmail,
        role: roleRow.key,
        clerk_invitation_sent: true,
        db_error: error.message,
      });
      return {
        ok: false as const,
        message: `Clerk invitation was sent but admin provisioning failed: ${error.message}. Please check Clerk pending invitations and retry.`,
      };
    }
    logAudit("member.invite", "member", undefined, {
      email: normalizedEmail,
      role: roleRow.key,
      clerk_invitation_sent: clerkInvitationAccepted,
    });
    // Create notification for staff invitation
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.staffInvited(normalizedEmail);
    } catch (err) {
      // Notification failure must not fail the invite
    }
    return {
      ok: true as const,
      message: clerkInvitationAccepted
        ? "Invitation sent via Clerk."
        : "Invitation recorded but Clerk email delivery could not be confirmed.",
    };
  });

// ══════════════════════════════════════════════════════════════
// CUSTOM ROLES (Persisted)
// ══════════════════════════════════════════════════════════════
export const adminListRoles = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const db = createDatabaseClient();
  const { data: roles } = await db.from("roles").select("*").order("created_at");
  // Get permission counts per role
  const { count: permCount } = await db
    .from("role_permissions")
    .select("id", { count: "exact", head: true });
  return { roles: roles ?? [] };
});

export const adminCreateRole = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().min(2).max(50),
      name: z.string().min(2),
      description: z.string().optional(),
      permission_ids: z.array(z.string().uuid()).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("roles.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Check unique key
    const { data: existing } = await db.from("roles").select("id").eq("key", data.key).single();
    if (existing) return { ok: false as const, message: "A role with this key already exists." };
    const { data: role, error } = await db
      .from("roles")
      .insert({
        key: data.key.toLowerCase().replace(/\s+/g, "_"),
        name: data.name,
        description: data.description || null,
        is_system: false,
      })
      .select()
      .single();
    if (error) return { ok: false as const, message: `Failed to create role: ${error.message}` };
    // Assign permissions
    if (data.permission_ids.length) {
      const perms = data.permission_ids.map((pid) => ({ role_id: role.id, permission_id: pid }));
      await db.from("role_permissions").insert(perms);
    }
    logAudit("role.create", "role", role.id, { key: data.key, name: data.name });
    return { ok: true as const, role };
  });

export const adminUpdateRole = createServerFn({ method: "POST" })
  .validator(
    z.object({
      role_id: z.string().uuid(),
      name: z.string().optional(),
      description: z.string().optional(),
      permission_ids: z.array(z.string().uuid()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("roles.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Protect system roles from key change
    const { data: role } = await db
      .from("roles")
      .select("is_system, key")
      .eq("id", data.role_id)
      .single();
    if (role?.is_system && data.name) {
      // System roles can only update name/description, not key
    }
    // Owner role permissions can ONLY be modified by Owner
    if (role?.key === "owner") {
      const { requireOwner } = await import("./admin-ops.server");
      const ownerErr = await requireOwner();
      if (ownerErr)
        return { ok: false as const, message: "Only the Owner can modify the Owner role." };
    }
    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    const { error } = await db.from("roles").update(updates).eq("id", data.role_id);
    if (error) return { ok: false as const, message: `Failed to update role: ${error.message}` };
    // Replace permissions if provided
    if (data.permission_ids) {
      await db.from("role_permissions").delete().eq("role_id", data.role_id);
      if (data.permission_ids.length) {
        const perms = data.permission_ids.map((pid) => ({
          role_id: data.role_id,
          permission_id: pid,
        }));
        await db.from("role_permissions").insert(perms);
      }
    }
    logAudit("role.update", "role", data.role_id, { name: data.name });
    // Create notification if permissions were changed
    if (data.permission_ids) {
      try {
        const { notifications } = await import("@/lib/notifications");
        const { data: roleData } = await db
          .from("roles")
          .select("name")
          .eq("id", data.role_id)
          .single();
        await notifications.rolePermissionsChanged(roleData?.name || "Unknown Role");
      } catch (err) {
        // Notification failure must not fail the operation
      }
    }
    return { ok: true as const };
  });

export const adminDeleteRole = createServerFn({ method: "POST" })
  .validator(z.object({ role_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("roles.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { data: role } = await db
      .from("roles")
      .select("is_system, key")
      .eq("id", data.role_id)
      .single();
    if (role?.is_system) return { ok: false as const, message: "Cannot delete system roles." };
    // Check if any members use this role
    const { count } = await db
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .eq("role_id", data.role_id);
    if (count && count > 0)
      return {
        ok: false as const,
        message: `Cannot delete: ${count} members still use this role.`,
      };
    const { error } = await db.from("roles").delete().eq("id", data.role_id);
    if (error) return { ok: false as const, message: `Failed to delete role: ${error.message}` };
    logAudit("role.delete", "role", data.role_id);
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SITE PAGES
// ══════════════════════════════════════════════════════════════
export const adminListSitePages = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("pages.manage");
    if (authError)
      return {
        pages: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("site_pages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data?.search) query = query.or(`title.ilike.%${data.search}%,slug.ilike.%${data.search}%`);
    const { data: pages, count } = await query.range(from, to);
    const total = count ?? 0;
    return { pages: pages ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });

// ══════════════════════════════════════════════════════════════
// APPLICATION DATA EXPORT (Owner-only)
// ══════════════════════════════════════════════════════════════

const EXPORT_TABLES = [
  "products",
  "categories",
  "product_images",
  "inventory",
  "customers",
  "orders",
  "order_items",
  "payment_transactions",
  "receipts",
  "coupons",
  "reviews",
  "testimonials",
  "blog_posts",
  "hero_slides",
  "site_pages",
  "site_settings",
  "social_links",
  "roles",
  "permissions",
  "role_permissions",
  "admin_users",
  "audit_logs",
  "contact_messages",
  "newsletter_subscribers",
  "marketing_suppression",
];

/** Rows that contain sensitive tokens or config that should be redacted in exports */
const SENSITIVE_COLUMNS: Record<string, string[]> = {
  site_settings: ["value"],
  customers: ["unsubscribe_token"],
  newsletter_subscribers: ["unsubscribe_token"],
  receipts: ["download_token"],
};

export const adminExportData = createServerFn({ method: "GET" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("backup.create");
    if (authError) return { ok: false as const, message: authError };
    // Rate-limit expensive export operation
    try {
      const { checkRateLimit } = await import("@/lib/rate-limit.server");
      const { auth } = await import("@clerk/tanstack-react-start/server");
      const session = await auth();
      const rl = await checkRateLimit("admin-export", session?.userId || undefined);
      if (rl.configured && !rl.success)
        return { ok: false as const, message: "Too many export requests. Please wait." };
    } catch {
      /* rate-limit failure must not block export */
    }
    const db = createDatabaseClient();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const manifest: Record<string, any> = {
      exported_at: new Date().toISOString(),
      application: "diplomat-global",
      tables: {},
    };
    const exportData: Record<string, any[]> = {};
    let totalRows = 0;

    for (const table of EXPORT_TABLES) {
      try {
        const { data: rows, error } = await db.from(table).select("*").limit(50000);
        if (error) {
          manifest.tables[table] = { error: error.message, row_count: 0 };
          continue;
        }
        let count = 0;
        if (rows && rows.length > 0) {
          // Redact sensitive columns
          const redactCols = SENSITIVE_COLUMNS[table] || [];
          exportData[table] = rows.map((row) => {
            const clean = { ...row };
            for (const col of redactCols) {
              if (clean[col] !== undefined) clean[col] = "[REDACTED]";
            }
            return clean;
          });
          count = rows.length;
        } else {
          exportData[table] = [];
        }
        manifest.tables[table] = { row_count: count };
        totalRows += count;
      } catch (err: any) {
        manifest.tables[table] = { error: err.message, row_count: 0 };
      }
    }

    manifest.total_rows = totalRows;
    manifest.table_count = Object.keys(exportData).length;

    // Build CSV content for each table
    const csvParts: string[] = [];
    csvParts.push(`# Diplomat Global Application Export`);
    csvParts.push(`# Exported: ${manifest.exported_at}`);
    csvParts.push(`# Tables: ${manifest.table_count}`);
    csvParts.push(`# Total rows: ${totalRows}`);
    csvParts.push("");

    for (const [table, rows] of Object.entries(exportData)) {
      csvParts.push(`\n--- ${table} (${rows.length} rows) ---`);
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      csvParts.push(headers.join(","));
      for (const row of rows) {
        const values = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          // Escape CSV: wrap in quotes if contains comma, quote, or newline
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        });
        csvParts.push(values.join(","));
      }
    }

    logAudit("data.export", "export", undefined, {
      tables: manifest.table_count,
      total_rows: totalRows,
    });
    // Check for table errors during export
    const tableErrors = Object.values(manifest.tables).filter((t: any) => t.error);
    // Create notification
    try {
      const { notifications } = await import("@/lib/notifications");
      if (tableErrors.length > 0) {
        const errMsg = tableErrors.map((e: any) => e.error).join("; ");
        await notifications.backupExportFailed(`Partial export: ${errMsg}`);
      } else {
        await notifications.backupExportSuccess(totalRows);
      }
    } catch (err) {
      // Notification failure must not fail the export
    }

    // Build per-table JSON map for client-side ZIP generation
    const tableJson: Record<string, string> = {};
    for (const [table, rows] of Object.entries(exportData)) {
      tableJson[table] = JSON.stringify(rows, null, 2);
    }

    return {
      ok: true as const,
      csv: csvParts.join("\n"),
      manifest,
      tableJson,
      filename: `diplomat-global-data-${timestamp}.csv`,
    };
  });

export const adminGetServiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("integrations.view");
  if (authError) return { status: null, error: authError };
  function hasEnv(...names: string[]) {
    return names.every((name) => Boolean((process.env[name] ?? "").trim()));
  }
  return {
    status: {
      clerk: hasEnv("CLERK_SECRET_KEY") && Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY),
      supabase: Boolean(
        process.env.SUPABASE_SECRET_KEY?.trim() && process.env.VITE_SUPABASE_URL?.trim(),
      ),
      cloudinary: hasEnv("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"),
      resend: hasEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL", "CONTACT_OWNER_EMAIL"),
      brevo:
        hasEnv("BREVO_API_KEY") &&
        Number.isSafeInteger(Number(process.env.BREVO_MARKETING_LIST_ID)),
      redis: hasEnv("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"),
      sentry: Boolean(process.env.SENTRY_DSN || import.meta.env.VITE_SENTRY_DSN),
      paystack: hasEnv("PAYSTACK_SECRET_KEY"),
      telegram: hasEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID"),
    },
  };
});

// ══════════════════════════════════════════════════════════════
// BLOG POSTS — CREATE / UPDATE
// ══════════════════════════════════════════════════════════════
export const adminUpdateBlogPost = createServerFn({ method: "POST" })
  .validator(
    z.object({
      post_id: z.string().uuid(),
      title: z.string().trim().min(1).max(300),
      slug: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      excerpt: z.string().trim().max(500).optional(),
      content: z.string().trim().max(50000).optional(),
      category: z.string().trim().max(100).optional(),
      image: cloudinaryImageUrlSchema.optional(),
      youtube_url: z.string().max(2000).optional(),
      read_time: z.string().max(50).optional(),
      status: z.enum(["draft", "published", "archived"]),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("blog.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const updates: any = {
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt || null,
      content: data.content || null,
      category: data.category || null,
      image: data.image || null,
      youtube_url: data.youtube_url || null,
      read_time: data.read_time || null,
      status: data.status,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const { error } = await db.from("blog_posts").update(updates).eq("id", data.post_id);
    if (error) return { ok: false as const, message: `Failed to update post: ${error.message}` };
    const { invalidateCachePrefix } = await import("@/lib/cache.server");
    invalidateCachePrefix("blog:posts:");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// HERO SLIDES — CREATE / UPDATE
// ══════════════════════════════════════════════════════════════
export const adminCreateHeroSlide = createServerFn({ method: "POST" })
  .validator(
    z.object({
      eyebrow: z.string().trim().max(50).optional(),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().max(500).optional(),
      price_context: z.string().trim().max(100).optional(),
      category: z.string().trim().max(100).optional(),
      cta_text: z.string().trim().max(50).default("Shop now"),
      cta_link: safeCtaLinkSchema.default("/shop"),
      image: cloudinaryImageUrlSchema.optional(),
      sort_order: z.number().default(0),
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("hero.manage", {
      auditOnDenial: true,
      context: "create hero slide",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("hero_slides").insert(data);
    if (error) return { ok: false as const, message: `Failed to create slide: ${error.message}` };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("hero:slides");
    return { ok: true as const };
  });

export const adminUpdateHeroSlide = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slide_id: z.string().uuid(),
      eyebrow: z.string().trim().max(50).optional(),
      title: z.string().trim().max(200).optional(),
      body: z.string().trim().max(500).optional(),
      price_context: z.string().trim().max(100).optional(),
      category: z.string().trim().max(100).optional(),
      cta_text: z.string().trim().max(50).optional(),
      cta_link: safeCtaLinkSchema.optional(),
      image: cloudinaryImageUrlSchema.optional(),
      sort_order: z.number().optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("hero.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { slide_id, ...updates } = data;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    const { error } = await db.from("hero_slides").update(filtered).eq("id", slide_id);
    if (error) return { ok: false as const, message: `Failed to update slide: ${error.message}` };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("hero:slides");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// TESTIMONIALS — CREATE / UPDATE
// ══════════════════════════════════════════════════════════════
export const adminCreateTestimonial = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(120),
      role: z.string().trim().max(100).optional(),
      message: z.string().trim().min(1).max(2000),
      rating: z.number().min(1).max(5).default(5),
      sort_order: z.number().default(0),
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("testimonials.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Admin-created testimonials are approved by definition
    const payload = {
      ...data,
      moderation_status: "approved",
      moderated_at: new Date().toISOString(),
    };
    const { error } = await db.from("testimonials").insert(payload);
    if (error)
      return { ok: false as const, message: `Failed to create testimonial: ${error.message}` };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("testimonials:list");
    return { ok: true as const };
  });

export const adminUpdateTestimonial = createServerFn({ method: "POST" })
  .validator(
    z.object({
      testimonial_id: z.string().uuid(),
      name: z.string().trim().max(120).optional(),
      role: z.string().trim().max(100).optional(),
      message: z.string().trim().max(2000).optional(),
      rating: z.number().min(1).max(5).optional(),
      sort_order: z.number().optional(),
      active: z.boolean().optional(),
      moderation_status: z.enum(["pending", "approved", "rejected"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("testimonials.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { testimonial_id, ...updates } = data;
    const filtered: Record<string, any> = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    // Sync active with moderation_status when moderation_status is explicitly set
    if (filtered.moderation_status) {
      filtered.active = filtered.moderation_status === "approved";
      filtered.moderated_at = new Date().toISOString();
    }
    if (Object.keys(filtered).length === 0) return { ok: true as const };
    const { error } = await db.from("testimonials").update(filtered).eq("id", testimonial_id);
    if (error)
      return { ok: false as const, message: `Failed to update testimonial: ${error.message}` };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("testimonials:list");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SOCIAL LINKS — CREATE / UPDATE
// ══════════════════════════════════════════════════════════════
export const adminCreateSocialLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform: z.string().min(1),
      url: z.string().min(1),
      icon: z.string().optional(),
      sort_order: z.number().default(0),
      is_active: z.boolean().default(true),
      link_type: z.enum(["social", "contact", "other"]).default("social"),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("social_links.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("social_links").insert(data);
    if (error)
      return {
        ok: false as const,
        message: error.message.includes("unique")
          ? "A link for this platform already exists."
          : `Failed to create link: ${error.message}`,
      };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("social:links");
    return { ok: true as const };
  });

export const adminUpdateSocialLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      link_id: z.string().uuid(),
      platform: z.string().optional(),
      url: z.string().optional(),
      icon: z.string().optional(),
      sort_order: z.number().optional(),
      is_active: z.boolean().optional(),
      link_type: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("social_links.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { link_id, ...updates } = data;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    const { error } = await db.from("social_links").update(filtered).eq("id", link_id);
    if (error) return { ok: false as const, message: `Failed to update link: ${error.message}` };
    const { invalidateCache } = await import("@/lib/cache.server");
    invalidateCache("social:links");
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SITE PAGES — CREATE / UPDATE
// ══════════════════════════════════════════════════════════════
export const adminCreateSitePage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      content: z.string().optional(),
      status: z.enum(["draft", "published", "archived"]).default("draft"),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("pages.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("site_pages").insert(data);
    if (error)
      return {
        ok: false as const,
        message: error.message.includes("unique")
          ? "A page with this slug already exists."
          : `Failed to create page: ${error.message}`,
      };
    return { ok: true as const };
  });

export const adminUpdateSitePage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      page_id: z.string().uuid(),
      slug: z.string().optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("pages.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { page_id, ...updates } = data;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    const { error } = await db.from("site_pages").update(filtered).eq("id", page_id);
    if (error) return { ok: false as const, message: `Failed to update page: ${error.message}` };
    return { ok: true as const };
  });

export const adminDeleteSitePage = createServerFn({ method: "POST" })
  .validator(z.object({ page_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("pages.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("site_pages").delete().eq("id", data.page_id);
    if (error) return { ok: false as const, message: "Failed to delete page." };
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// PUBLIC API — fetch active hero slides for homepage
// ══════════════════════════════════════════════════════════════
export const getPublicHeroSlides = createServerFn({ method: "GET" }).handler(async () => {
  const { cached, TTL } = await import("@/lib/cache.server");
  return cached("hero:slides", TTL.LONG, async () => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db
      .from("hero_slides")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(10);
    const raw = data ?? [];
    // Resolve source-bound slides against LIVE product/blog records (§1–§4):
    // derived content, snapshot fallback on fetch failure, omit on missing or
    // unpublished source so the carousel never renders dead CTA links.
    const { resolveHeroSlides } = await import("@/lib/hero-source");
    const slides = await resolveHeroSlides(raw, {
      loadProducts: async (slugs) => {
        const { data: rows, error } = await db
          .from("products")
          .select(
            "name, slug, tagline, description, status, categories(name), product_images(secure_url, sort_order)",
          )
          .in("slug", slugs);
        const map = new Map();
        for (const row of rows ?? []) {
          const images = [...(row.product_images ?? [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          );
          map.set(row.slug, {
            name: row.name,
            slug: row.slug,
            tagline: row.tagline,
            description: row.description,
            status: row.status,
            categoryName: (row.categories as { name?: string } | null)?.name ?? null,
            // undefined = not derived yet → resolver falls back to loader below.
            image: images[0]?.secure_url ?? null,
          });
        }
        if (error) console.error("[hero] product source load failed:", error.message);
        return map;
      },
      loadProductImage: async () => null,
      // Whitespace-tolerant last resort: keep the SAME product reachable when
      // a stored hero link's spacing differs from the stored slug (e.g. a
      // trailing-space slug like "Ls32a700nwnxza "). Candidates are filtered
      // client-side to an exact whitespace-insensitive match, so this never
      // resolves to a different product. The derived CTA still uses the
      // canonical DB slug, fixing the dead link at its root.
      findProductBySlugCollapsed: async (collapsed) => {
        const { data: rows, error } = await db
          .from("products")
          .select(
            "name, slug, tagline, description, status, categories(name), product_images(secure_url, sort_order)",
          )
          .eq("status", "active");
        if (error) {
          console.error("[hero] collapsed-slug lookup failed:", error.message);
          return null;
        }
        const row = (rows ?? []).find((r) => r.slug.replace(/\s+/g, "") === collapsed);
        if (!row) return null;
        const images = [...(row.product_images ?? [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        return {
          name: row.name,
          slug: row.slug,
          tagline: row.tagline,
          description: row.description,
          status: row.status,
          categoryName: (row.categories as { name?: string } | null)?.name ?? null,
          image: images[0]?.secure_url ?? null,
        };
      },
      loadBlogs: async (slugs) => {
        const { data: rows, error } = await db
          .from("blog_posts")
          .select("title, slug, excerpt, category, image, youtube_url, status")
          .in("slug", slugs);
        const map = new Map();
        for (const row of rows ?? []) {
          map.set(row.slug, {
            title: row.title,
            slug: row.slug,
            excerpt: row.excerpt,
            category: row.category,
            image: row.image,
            youtubeUrl: row.youtube_url,
            status: row.status,
          });
        }
        if (error) console.error("[hero] blog source load failed:", error.message);
        return map;
      },
    });
    return { slides };
  });
});

/**
 * Admin view of hero source health (Owner finding §6): for every stored slide
 * it reports how the PUBLIC homepage resolves it — rendered live-bound,
 * rendered static, or omitted with the reason. Admin must never present four
 * apparently healthy active slides while public silently shows three.
 */
export const adminHeroSlideDiagnostics = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission, createDatabaseClient } = await import("./admin-ops.server");
  const authError = await requirePermission("hero.manage");
  if (authError) return { ok: false as const, message: authError };
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("hero_slides")
    .select("*")
    // Mirror the public loader exactly: only ACTIVE slides ever reach the
    // resolver publicly, so only they can be "omitted" — an inactive slide is
    // intentionally unpublished and must not count as a public omission.
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) return { ok: false as const, message: error.message };
  const raw = data ?? [];
  const { resolveHeroSlides } = await import("@/lib/hero-source");
  const omissions: Array<{ title: string; link: string; issue: string }> = [];
  const slides = await resolveHeroSlides(
    raw,
    {
      loadProducts: async (slugs) => {
        const { data: rows, error: perr } = await db
          .from("products")
          .select(
            "name, slug, tagline, description, status, categories(name), product_images(secure_url, sort_order)",
          )
          .in("slug", slugs);
        if (perr) throw new Error(perr.message);
        const map = new Map();
        for (const row of rows ?? []) {
          const images = [...(row.product_images ?? [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
          );
          map.set(row.slug, {
            name: row.name,
            slug: row.slug,
            tagline: row.tagline,
            description: row.description,
            status: row.status,
            categoryName: (row.categories as { name?: string } | null)?.name ?? null,
            image: images[0]?.secure_url ?? null,
          });
        }
        return map;
      },
      loadProductImage: async () => null,
      findProductBySlugCollapsed: async (collapsed) => {
        const { data: rows, error: perr } = await db
          .from("products")
          .select(
            "name, slug, tagline, description, status, categories(name), product_images(secure_url, sort_order)",
          )
          .eq("status", "active");
        if (perr) throw new Error(perr.message);
        const row = (rows ?? []).find((r) => r.slug.replace(/\s+/g, "") === collapsed);
        if (!row) return null;
        const images = [...(row.product_images ?? [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        return {
          name: row.name,
          slug: row.slug,
          tagline: row.tagline,
          description: row.description,
          status: row.status,
          categoryName: (row.categories as { name?: string } | null)?.name ?? null,
          image: images[0]?.secure_url ?? null,
        };
      },
      loadBlogs: async (slugs) => {
        const { data: rows, error: berr } = await db
          .from("blog_posts")
          .select("title, slug, excerpt, category, image, youtube_url, status")
          .in("slug", slugs);
        if (berr) throw new Error(berr.message);
        const map = new Map();
        for (const row of rows ?? []) {
          map.set(row.slug, {
            title: row.title,
            slug: row.slug,
            excerpt: row.excerpt,
            category: row.category,
            image: row.image,
            youtubeUrl: row.youtube_url,
            status: row.status,
          });
        }
        return map;
      },
    },
    (o) =>
      omissions.push({
        title: String(o.slide.title ?? ""),
        link: String(o.slide.cta_link ?? ""),
        issue: o.issue,
      }),
  );
  return {
    ok: true as const,
    totalSlides: raw.length,
    publicRendered: slides.length,
    omissions,
  };
});

export const getPublicTestimonials = createServerFn({ method: "GET" }).handler(async () => {
  const { cached, TTL } = await import("@/lib/cache.server");
  return cached("testimonials:list", TTL.MEDIUM, async () => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db
      .from("testimonials")
      .select("id, name, role, message, rating, photo_url, sort_order, created_at")
      .eq("active", true)
      .eq("moderation_status", "approved")
      .order("sort_order", { ascending: true })
      .limit(20);
    return { testimonials: data ?? [] };
  });
});

export const getPublicBlogPosts = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(12),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 12;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { cached, TTL } = await import("@/lib/cache.server");
    return cached(`blog:posts:${page}:${pageSize}`, TTL.BLOG, async () => {
      const { createDatabaseClient } = await import("./admin-ops.server");
      const db = createDatabaseClient();
      const { data: posts, count } = await db
        .from("blog_posts")
        .select("*", { count: "exact" })
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .range(from, to);
      const total = count ?? 0;
      return {
        posts: posts ?? [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  });

export const getPublicBlogPostBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data: post } = await db
      .from("blog_posts")
      .select("*")
      .eq("slug", data.slug)
      .eq("status", "published")
      .single();
    return { post: post ?? null };
  });

export const getPublicSocialLinks = createServerFn({ method: "GET" }).handler(async () => {
  const { cached, TTL } = await import("@/lib/cache.server");
  return cached("social:links", TTL.LONG, async () => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db
      .from("social_links")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { links: data ?? [] };
  });
});

export const getPublicPageBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data: page } = await db
      .from("site_pages")
      .select("*")
      .eq("slug", data.slug)
      .eq("status", "published")
      .single();
    return { page: page ?? null };
  });

// ══════════════════════════════════════════════════════════════
// PUBLIC PRODUCTS & CATEGORIES
// ══════════════════════════════════════════════════════════════
export const loadPublicProducts = createServerOnlyFn(async () => {
  const { createDatabaseClient, getDatabaseConfig } = await import("./admin-ops.server");
  const config = getDatabaseConfig();
  if (!config) {
    console.error(
      "[getPublicProducts] Database not configured — check SUPABASE_URL and SUPABASE_SECRET_KEY env vars",
    );
    throw new Error("Products are temporarily unavailable. Please retry.");
  }
  const db = createDatabaseClient();
  const { data: products, error } = await db
    .from("products")
    .select(
      "*, product_images!product_images_product_id_fkey(secure_url, cloudinary_public_id, alt_text, sort_order), inventory(quantity, reserved, low_stock_threshold), categories(name, slug)",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Products are temporarily unavailable. Please retry.");
  const { loadInventorySettings } = await import("../inventory-settings.server");
  const { defaultThreshold } = await loadInventorySettings(db);
  const mapped = (products ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    tagline: p.tagline || "",
    category: p.categories?.name || "Uncategorized",
    categorySlug: p.categories?.slug || "",
    price: Number(p.price),
    compareAt: p.compare_at_price ? Number(p.compare_at_price) : undefined,
    ...mapProductGallery(p.product_images),
    // Inventory quantity is authoritative when present; in_stock is fallback when no inventory record.
    inStock: isProductAvailable(p.inventory, p.in_stock),
    ...(() => {
      const s = resolveInventoryState(p.inventory, p.in_stock, defaultThreshold);
      return { stockState: s.state, stockQuantity: s.quantity };
    })(),
    featured: p.featured,
    isNew: p.is_new,
    description: p.description || "",
    specs: Array.isArray(p.specifications) ? p.specifications : [],
  }));
  return { products: mapped };
});

export const getPublicProducts = createServerFn({ method: "GET" }).handler(async () =>
  loadPublicProducts(),
);

export const loadPublicProductsPaginated = createServerOnlyFn(
  async ({
    data,
  }: {
    data: {
      page: number;
      pageSize: number;
      categories: string[];
      q: string;
      sort: "newest" | "priceAsc" | "priceDesc" | "popular";
    };
  }) => {
    const { createDatabaseClient, getDatabaseConfig } = await import("./admin-ops.server");
    const config = getDatabaseConfig();
    if (!config) {
      console.error("[getPublicProductsPaginated] Database not configured");
      throw new Error("Products are temporarily unavailable. Please retry.");
    }
    const db = createDatabaseClient();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // Base query: active products with joins
    let query = db
      .from("products")
      .select(
        "*, product_images!product_images_product_id_fkey(secure_url, cloudinary_public_id, alt_text, sort_order), inventory(quantity, reserved, low_stock_threshold), categories(name, slug)",
        { count: "exact" },
      )
      .eq("status", "active");

    // Apply category filter in DB — look up category IDs by slug first
    if (data.categories.length > 0) {
      const { data: catRows, error: categoryError } = await db
        .from("categories")
        .select("id")
        .in("slug", data.categories)
        .eq("active", true);
      if (categoryError) {
        console.error(
          "[getPublicProductsPaginated] Category lookup failed:",
          categoryError.message,
        );
        return {
          products: [] as any[],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          totalPages: 0,
          error: "The selected category could not be loaded.",
        };
      }
      const catIds = (catRows ?? []).map((c: any) => c.id);
      if (catIds.length > 0) {
        query = query.in("category_id", catIds);
      } else {
        // No matching categories found — return empty
        return {
          products: [] as any[],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          totalPages: 0,
        };
      }
    }

    // Apply search filter in DB (name, tagline, description)
    const catalogSearch = buildCatalogSearchFilter(data.q);
    if (catalogSearch) query = query.or(catalogSearch);

    // Apply sort in DB
    if (data.sort === "priceAsc") query = query.order("price", { ascending: true });
    else if (data.sort === "priceDesc") query = query.order("price", { ascending: false });
    else if (data.sort === "popular")
      query = query
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    // Apply pagination range in DB
    const { data: products, count, error } = await query.range(from, to);
    if (error) {
      console.error("[getPublicProductsPaginated] Query error:", error.message);
      throw new Error("Products are temporarily unavailable. Please retry.");
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / data.pageSize);
    const { loadInventorySettings } = await import("../inventory-settings.server");
    const { defaultThreshold } = await loadInventorySettings(db);
    const mapped = (products ?? []).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      tagline: p.tagline || "",
      category: p.categories?.name || "Uncategorized",
      categorySlug: p.categories?.slug || "",
      price: Number(p.price),
      compareAt: p.compare_at_price ? Number(p.compare_at_price) : undefined,
      ...mapProductGallery(p.product_images),
      // Inventory quantity is authoritative when present; in_stock is fallback when no inventory record.
      inStock: isProductAvailable(p.inventory, p.in_stock),
      ...(() => {
        const s = resolveInventoryState(p.inventory, p.in_stock, defaultThreshold);
        return { stockState: s.state, stockQuantity: s.quantity };
      })(),
      featured: p.featured,
      isNew: p.is_new,
      description: p.description || "",
      specs: Array.isArray(p.specifications) ? p.specifications : [],
    }));
    return { products: mapped, total, page: data.page, pageSize: data.pageSize, totalPages };
  },
);

export const getPublicProductsPaginated = createServerFn({ method: "GET" })
  .validator(
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(12),
      categories: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(100)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        )
        .max(20)
        .default([]),
      q: z.string().max(100).default(""),
      sort: z.enum(["newest", "priceAsc", "priceDesc", "popular"]).default("newest"),
    }),
  )
  .handler(async ({ data }) => loadPublicProductsPaginated({ data }));

export const loadPublicProductBySlug = createServerOnlyFn(
  async ({ data }: { data: { slug: string } }) => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { productSlugCandidates, pickProductBySlug } = await import("../product-slug");
    // Tolerate the historical trailing-space slugs so the clean canonical URL
    // and the older url-encoded `%20` links both resolve to the same product.
    const candidates = productSlugCandidates(data.slug);
    if (candidates.length === 0) return { product: null };
    const { data: rows, error } = await db
      .from("products")
      .select(
        "*, product_images!product_images_product_id_fkey(secure_url, cloudinary_public_id, alt_text, sort_order, width, height), inventory(quantity, reserved, low_stock_threshold), categories(name, slug, id)",
      )
      .in("slug", candidates)
      .eq("status", "active")
      .limit(2);
    if (error) throw new Error("This product is temporarily unavailable. Please retry.");
    const product = pickProductBySlug(rows, data.slug);
    if (!product) return { product: null };
    const p = product as any;
    const { loadInventorySettings } = await import("../inventory-settings.server");
    const { defaultThreshold } = await loadInventorySettings(db);
    return {
      product: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline || "",
        category: p.categories?.name || "Other",
        categoryId: p.categories?.id,
        categorySlug: p.categories?.slug || "",
        price: Number(p.price),
        compareAt: p.compare_at_price ? Number(p.compare_at_price) : undefined,
        ...mapProductGallery(p.product_images),
        // Inventory quantity is authoritative when present; in_stock is fallback when no inventory record.
        inStock: isProductAvailable(p.inventory, p.in_stock),
        ...(() => {
          const s = resolveInventoryState(p.inventory, p.in_stock, defaultThreshold);
          return { stockState: s.state, stockQuantity: s.quantity };
        })(),
        featured: p.featured,
        isNew: p.is_new,
        isEasyBuy: p.is_easy_buy,
        description: p.description || "",
        specs: (() => {
          try {
            const raw = p.specifications;
            if (!raw) return [];
            if (typeof raw === "string") {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            }
            return Array.isArray(raw) ? raw : [];
          } catch {
            return [];
          }
        })(),
        condition: p.condition || "new",
        status: p.status,
        sku: p.sku,
      },
    };
  },
);

export const getPublicProductBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => loadPublicProductBySlug({ data }));

export const loadRelatedProducts = createServerOnlyFn(
  async ({ data }: { data: { categoryId?: string; excludeId?: string; limit: number } }) => {
    const { createDatabaseClient, getDatabaseConfig } = await import("./admin-ops.server");
    if (!getDatabaseConfig()) return { products: [] as any[] };
    const db = createDatabaseClient();
    let query = db
      .from("products")
      .select(
        "id, slug, name, tagline, price, in_stock, featured, is_new, category_id, product_images!product_images_product_id_fkey(secure_url, cloudinary_public_id, sort_order), inventory(quantity, reserved, low_stock_threshold), categories(name)",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (data.categoryId) {
      query = query.eq("category_id", data.categoryId);
    }
    if (data.excludeId) {
      query = query.neq("id", data.excludeId);
    }
    query = query.limit(data.limit);
    const { data: rows, error } = await query;
    if (error) throw new Error("Recommendations are temporarily unavailable.");
    const { loadInventorySettings } = await import("../inventory-settings.server");
    const { defaultThreshold } = await loadInventorySettings(db);
    const products = (rows ?? []).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline || "",
      category: p.categories?.name || "Other",
      price: Number(p.price),
      ...mapProductGallery(p.product_images),
      // Inventory quantity is authoritative when present; in_stock is fallback when no inventory record.
      inStock: isProductAvailable(p.inventory, p.in_stock),
      stockState: resolveInventoryState(p.inventory, p.in_stock, defaultThreshold).state,
      stockQuantity: resolveInventoryState(p.inventory, p.in_stock, defaultThreshold).quantity,
      featured: p.featured,
      isNew: p.is_new,
    }));
    return { products };
  },
);

export const getRelatedProducts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      categoryId: z.string().optional(),
      excludeId: z.string().optional(),
      limit: z.number().int().min(1).max(10).default(4),
    }),
  )
  .handler(async ({ data }) => loadRelatedProducts({ data }));

export const getPublicCategories = createServerFn({ method: "GET" }).handler(async () => {
  // Categories are an Owner-managed navigation dataset. A process-local cache
  // cannot be invalidated across serverless instances, so query the authoritative
  // rows on every root load and make DB failures explicit.
  const { createDatabaseClient } = await import("./admin-ops.server");
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("categories")
    .select("id, name, slug, description, icon, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("[getPublicCategories] Query failed:", error.message);
    throw new Error("Public categories could not be loaded.");
  }
  return { categories: data ?? [] };
});

/**
 * Diagnostic: return ALL categories (active + inactive) for debugging.
 * Admin-only — never expose to public.
 */
export const adminDiagnoseCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("categories.manage");
  if (authError) return { error: authError };
  const { createDatabaseClient } = await import("./admin-ops.server");
  const db = createDatabaseClient();
  const { data: all, error: e1 } = await db
    .from("categories")
    .select("id, name, slug, active, sort_order, created_at")
    .order("sort_order");
  const { data: active, error: e2 } = await db
    .from("categories")
    .select("id, name, slug, active, sort_order")
    .eq("active", true)
    .order("sort_order");
  return {
    all_categories: all ?? [],
    active_categories: active ?? [],
    total_count: all?.length ?? 0,
    active_count: active?.length ?? 0,
    inactive_count: (all?.length ?? 0) - (active?.length ?? 0),
    query_errors: { all: e1?.message || null, active: e2?.message || null },
  };
});

/**
 * §14 — Owner-only test-data purge (dry-run default).
 *
 * Dynamically imported: this module is client-reachable (route components load
 * it), and the import-protection plugin forbids a static edge from here to a
 * `server-only` module. The dynamic import keeps the implementation server-side
 * while exposing the serverFn reference through the RPC bridge.
 */
export const ownerTestdataPurge = createServerFn({ method: "POST" })
  .validator((payload: unknown) => payload)
  .handler(async ({ data }) => {
    const { ownerTestdataPurge: purge } = await import("./testdata-purge.server");
    return purge({ data: data as Parameters<typeof purge>[0]["data"] });
  });

/** Get current admin's permission keys for sidebar navigation filtering */
export const adminGetMyPermissions = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentAdminPermissions } = await import("./admin-ops.server");
  const perms = await getCurrentAdminPermissions();
  return { permissions: perms };
});

/** Current admin's role key — used to reveal Owner-only UI (server still enforces). */
export const adminGetMyRole = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentAdminRoleKey } = await import("./admin-ops.server");
  const role = await getCurrentAdminRoleKey();
  return { role };
});

export const getPublicSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { cached, TTL } = await import("@/lib/cache.server");
  return cached("site:settings", TTL.LONG, async () => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db.from("site_settings").select("*");
    const settings: Record<string, string> = {};
    (data ?? []).forEach((s: any) => {
      settings[s.key] = s.value;
    });
    return { settings };
  });
});

// ══════════════════════════════════════════════════════════════
// RECEIPTS — View HTML / Resend email
// ══════════════════════════════════════════════════════════════
export const adminGetReceiptHTML = createServerFn({ method: "GET" })
  .validator(z.object({ receipt_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("receipts.view");
    if (authError) return { html: null, error: authError };
    const { generateReceiptHTML, loadReceiptDocumentById } = await import("@/lib/receipt.server");
    try {
      const receipt = await loadReceiptDocumentById(data.receipt_id);
      if (!receipt) return { html: null, error: "Finalized receipt not found" };
      return { html: generateReceiptHTML(receipt) };
    } catch {
      return { html: null, error: "Receipt is temporarily unavailable" };
    }
  });

export const adminResendReceipt = createServerFn({ method: "POST" })
  .validator(z.object({ receipt_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("receipts.send");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    try {
      const { loadReceiptDocumentById } = await import("@/lib/receipt.server");
      const receipt = await loadReceiptDocumentById(data.receipt_id);
      if (!receipt) return { ok: false as const, message: "Finalized receipt not found" };
      const { sendTransactionalEmail } = await import("@/lib/email.server");
      const { paymentReceiptTemplate } = await import("@/lib/email-templates.server");
      const { buildAbsoluteUrl } = await import("@/lib/site-origin.server");
      // Canonical receipt PDF from the SAME renderer the Download Receipt
      // button and the automatic post-payment email use — one receipt
      // representation everywhere. Attachment failure never blocks the resend.
      let receiptAttachment: { filename: string; contentBase64: string } | undefined;
      try {
        const { formatReceiptPdfFilename, generateReceiptPdf } = await import("@/lib/receipt-pdf");
        receiptAttachment = {
          filename: formatReceiptPdfFilename(receipt.receipt_number),
          contentBase64: Buffer.from(generateReceiptPdf(receipt)).toString("base64"),
        };
      } catch (err) {
        console.error("[admin-resend-receipt] PDF attachment unavailable:", err);
      }
      const emailResult = await sendTransactionalEmail({
        to: receipt.customer_email,
        subject: `Your Diplomat Global Receipt ${receipt.receipt_number}`,
        ...(receiptAttachment ? { attachments: [receiptAttachment] } : {}),
        html: paymentReceiptTemplate({
          customerName: receipt.customer_name,
          receiptNumber: receipt.receipt_number,
          orderReference: receipt.order_reference,
          paystackReference: receipt.payment_reference || undefined,
          items: receipt.items,
          subtotal: receipt.subtotal,
          discount: receipt.discount,
          delivery_fee: receipt.delivery_fee,
          total: receipt.total,
          paymentDate: receipt.payment_date,
          receiptUrl: buildAbsoluteUrl(`/api/receipt/${receipt.receipt_token}`),
          company: receipt.company,
        }),
      });
      if (!emailResult.sent) {
        await db
          .from("receipts")
          .update({ failure_reason: emailResult.error || "Transactional email was not accepted" })
          .eq("id", data.receipt_id);
        return { ok: false as const, message: "Receipt email could not be sent." };
      }
      await db
        .from("receipts")
        .update({
          status: "emailed",
          sent_email_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", data.receipt_id);
      return { ok: true as const };
    } catch (error) {
      await db
        .from("receipts")
        .update({
          failure_reason: error instanceof Error ? error.message : "Receipt email failed",
        })
        .eq("id", data.receipt_id);
      return { ok: false as const, message: "Receipt email could not be sent." };
    }
  });

// ══════════════════════════════════════════════════════════════
// INTEGRATIONS — Masked credentials + test connection
// ══════════════════════════════════════════════════════════════
export const adminGetIntegrationStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission, logAudit } = await import("./admin-ops.server");
  const authError = await requirePermission("integrations.view");
  if (authError) return { integrations: [], error: authError };
  const db = createDatabaseClient();
  const { data: configs } = await db.from("integration_configs").select("*");
  function hasEnv(...names: string[]) {
    return names.every((n) => Boolean((process.env[n] ?? "").trim()));
  }
  const envStatus = [
    {
      provider: "clerk",
      name: "Clerk Authentication",
      configured: hasEnv("CLERK_SECRET_KEY") && Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY),
      icon: "users",
    },
    {
      provider: "supabase",
      name: "Supabase Database",
      configured: Boolean(
        process.env.SUPABASE_SECRET_KEY?.trim() && process.env.VITE_SUPABASE_URL?.trim(),
      ),
      icon: "database",
    },
    {
      provider: "cloudinary",
      name: "Cloudinary Media",
      configured: hasEnv("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"),
      icon: "image",
    },
    (() => {
      const configured = hasEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
      const domain = (process.env.RESEND_FROM_EMAIL || "").trim().match(/@(.+)$/)?.[1] || null;
      const domainVerified = configured && process.env.RESEND_DOMAIN_VERIFIED === "true";
      const statusDetail = !configured
        ? "API key or sender email missing"
        : !domainVerified
          ? `Domain ${domain || "unknown"} — verification pending`
          : `Domain ${domain} — verified`;
      return {
        provider: "resend",
        name: "Resend (Transactional Email)",
        configured,
        domain: domain || "not set",
        domain_verified: domainVerified,
        operational: configured && domainVerified,
        status_detail: statusDetail,
        icon: "mail",
      };
    })(),
    (() => {
      const hasApiKey = hasEnv("BREVO_API_KEY");
      const hasListId = Number.isSafeInteger(Number(process.env.BREVO_MARKETING_LIST_ID));
      const senderEmail =
        (process.env.BREVO_SENDER_EMAIL || "").trim() || "diplomatglobaltechs@gmail.com";
      const configured = hasApiKey && hasListId;
      const statusDetail = !hasApiKey
        ? "API key missing"
        : !hasListId
          ? "List ID missing or invalid"
          : "Configured — not yet tested";
      return {
        provider: "brevo",
        name: "Brevo (Marketing Email)",
        configured,
        status_detail: statusDetail,
        sender: senderEmail,
        operational: false, // Never claim operational without a real send test
        icon: "send",
      };
    })(),
    {
      provider: "paystack",
      name: "Paystack (Payments)",
      configured: hasEnv("PAYSTACK_SECRET_KEY"),
      icon: "credit-card",
    },
    (() => {
      const configured = hasEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID");
      // Will be tested asynchronously below
      return {
        provider: "telegram",
        name: "Telegram (Admin Alerts)",
        configured,
        operational: false as boolean,
        bot_username: null as string | null,
        destination_configured: configured,
        status_detail: "Not tested",
        icon: "message-circle",
      };
    })(),
    {
      provider: "redis",
      name: "Upstash Redis (Rate Limiting)",
      configured: hasEnv("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"),
      icon: "zap",
    },
    {
      provider: "sentry",
      name: "Sentry (Error Tracking)",
      configured: Boolean(process.env.SENTRY_DSN || import.meta.env.VITE_SENTRY_DSN),
      icon: "alert-triangle",
    },
  ];
  // Test Telegram connectivity if configured (non-blocking)
  const telegramEntry = envStatus.find((e) => e.provider === "telegram") as any;
  if (telegramEntry?.configured) {
    try {
      const { verifyTelegramConnectivity, verifyTelegramChat } =
        await import("@/lib/telegram.server");
      const [botResult, chatResult] = await Promise.allSettled([
        verifyTelegramConnectivity(),
        verifyTelegramChat(),
      ]);
      const botOk = botResult.status === "fulfilled" && botResult.value.ok;
      const chatOk = chatResult.status === "fulfilled" && chatResult.value.ok;
      // getChat success alone does NOT prove deliverability — the destination
      // may be another bot ("bot can't send messages to the bot") or a chat
      // where the bot was blocked. Only a successful getChat AND the chat NOT
      // being a bot counts as operational.
      const botId =
        botResult.status === "fulfilled" && botResult.value.ok
          ? String(botResult.value.botId)
          : null;
      const adminChatId = (process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
      const chatIsBot = botId !== null && botId === adminChatId;
      telegramEntry.operational = botOk && chatOk && !chatIsBot;
      if (botResult.status === "fulfilled" && botResult.value.ok) {
        telegramEntry.bot_username = botResult.value.botUsername;
      }
      telegramEntry.destination_configured = chatOk;
      telegramEntry.status_detail = !chatOk
        ? "Destination chat not accessible — check TELEGRAM_ADMIN_CHAT_ID"
        : chatIsBot
          ? "CONFIGURATION REQUIRED — TELEGRAM_ADMIN_CHAT_ID is the bot's own ID; set your personal/group chat ID"
          : botOk
            ? `Bot @${telegramEntry.bot_username} reachable, destination accessible`
            : "Bot token invalid or network failure";
    } catch {
      // Non-fatal — leave operational as false
    }
  }

  const dbConfigs = (configs || []).reduce((acc: Record<string, any>, c: any) => {
    acc[c.provider] = c;
    return acc;
  }, {});
  const integrations = envStatus.map((e) => ({
    ...e,
    last_tested_at: dbConfigs[e.provider]?.last_tested_at || null,
    last_test_result: dbConfigs[e.provider]?.last_test_result || null,
    updated_by: dbConfigs[e.provider]?.updated_by || null,
  }));
  return { integrations };
});

export const adminTestTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("integrations.manage", {
    auditOnDenial: true,
    context: "test Telegram",
  });
  if (authError) return { ok: false as const, message: authError };
  const { sendTelegramMessage, isTelegramConfigured } = await import("@/lib/telegram.server");
  if (!isTelegramConfigured()) {
    return {
      ok: false as const,
      message: "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID.",
    };
  }
  const result = await sendTelegramMessage(
    "🤖 *Diplomat Global*\n\nTelegram integration test — successful.",
  );
  if (result.success) {
    return { ok: true as const };
  }
  return { ok: false as const, message: result.error || "Failed to send test message" };
});

// ══════════════════════════════════════════════════════════════
// TELEGRAM DIAGNOSTICS — getMe + getChat + ID comparison
// ══════════════════════════════════════════════════════════════
export const adminTelegramDiagnose = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("integrations.manage");
  if (authError) return { ok: false as const, error: authError };

  const { verifyTelegramConnectivity, verifyTelegramChat, isTelegramConfigured } =
    await import("@/lib/telegram.server");
  if (!isTelegramConfigured()) {
    return {
      ok: false as const,
      error:
        "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in Vercel.",
    };
  }

  // 1. getMe — get bot identity
  const me = await verifyTelegramConnectivity();

  // 2. getChat — verify admin chat ID is accessible
  const chat = await verifyTelegramChat();

  // 3. Compare bot ID vs configured admin chat ID
  let chatIsBot = false;
  if (me.ok && chat.ok) {
    const botId = String(me.botId);
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
    chatIsBot = botId === adminChatId;
  }

  return {
    ok: true as const,
    bot: me.ok
      ? { name: me.botFirstName, username: me.botUsername, id: me.botId }
      : { error: me.error },
    chat: chat.ok ? { accessible: true } : { accessible: false, error: chat.error },
    chatIsBot,
    webhookSecretConfigured: !!process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
  };
});

// ══════════════════════════════════════════════════════════════
// TELEGRAM REGISTER WEBHOOK
// ══════════════════════════════════════════════════════════════
export const adminRegisterTelegramWebhook = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url() }))
  .handler(async ({ data }) => {
    const { requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("integrations.manage", {
      auditOnDenial: true,
      context: "register Telegram webhook",
    });
    if (authError) return { ok: false as const, message: authError };

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!botToken) return { ok: false as const, message: "TELEGRAM_BOT_TOKEN not configured." };

    const webhookUrl = data.url.replace(/\/+$/, "") + "/api/webhook/telegram";

    const body: Record<string, any> = { url: webhookUrl };
    if (webhookSecret) {
      body.secret_token = webhookSecret;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        return { ok: false as const, message: json.description || `HTTP ${res.status}` };
      }
      return { ok: true as const, webhookUrl };
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : "Failed to register webhook",
      };
    }
  });

// ══════════════════════════════════════════════════════════════
// TELEGRAM REGISTER COMMANDS (setMyCommands)
// ══════════════════════════════════════════════════════════════
export const adminRegisterTelegramCommands = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("integrations.manage");
    if (authError) return { ok: false as const, message: authError };

    const { registerBotCommands, isTelegramConfigured } = await import("@/lib/telegram.server");
    const { TELEGRAM_COMMANDS } = await import("@/lib/telegram/commands/definitions.server");
    if (!isTelegramConfigured()) return { ok: false as const, message: "Telegram not configured." };

    const cmds = TELEGRAM_COMMANDS.filter((c) => c.registerable).map((c) => ({
      command: c.command,
      description: c.description,
    }));
    const result = await registerBotCommands(cmds);
    if (result.success) return { ok: true as const, commands: cmds.map((c) => c.command) };
    return { ok: false as const, message: result.error || "Failed to register commands" };
  },
);

// ══════════════════════════════════════════════════════════════
// TELEGRAM WEBHOOK INFO
// ══════════════════════════════════════════════════════════════
export const adminGetTelegramWebhookInfo = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("integrations.manage");
  if (authError) return { ok: false as const, error: authError };

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return { ok: false as const, error: "TELEGRAM_BOT_TOKEN not configured." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const json = await res.json();
    if (!res.ok || !json.ok)
      return { ok: false as const, error: json.description || `HTTP ${res.status}` };
    const info = json.result;
    return {
      ok: true as const,
      url: info.url || "none",
      hasCustomCertificate: info.has_custom_certificate,
      pendingUpdateCount: info.pending_update_count,
      lastErrorDate: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
      lastErrorMessage: info.last_error_message || null,
      maxConnections: info.max_connections,
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Failed" };
  }
});

// ══════════════════════════════════════════════════════════════
// PROFILE AVATAR
// ══════════════════════════════════════════════════════════════
export const adminSaveAvatarUrl = createServerFn({ method: "POST" })
  .validator(z.object({ avatar_url: cloudinaryImageUrlSchema }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authErr = await requirePermission("settings.manage");
    if (authErr) return { ok: false as const, message: authErr };
    const { auth } = await import("@clerk/tanstack-react-start/server");
    const session = await auth();
    if (!session.userId) return { ok: false as const, message: "Not authenticated." };
    const db = createDatabaseClient();
    const { error } = await db
      .from("admin_users")
      .update({ avatar_url: data.avatar_url })
      .eq("clerk_user_id", session.userId);
    if (error) return { ok: false as const, message: "Failed to save avatar." };
    return { ok: true as const, avatar_url: data.avatar_url };
  });

export const adminGetAvatarUrl = createServerFn({ method: "GET" }).handler(async () => {
  const { auth } = await import("@clerk/tanstack-react-start/server");
  const session = await auth();
  if (!session.userId) return { avatar_url: null as string | null };
  try {
    const { createDatabaseClient, getDatabaseConfig } = await import("./admin-ops.server");
    if (!getDatabaseConfig()) return { avatar_url: null as string | null };
    const db = createDatabaseClient();
    const { data } = await db
      .from("admin_users")
      .select("avatar_url")
      .eq("clerk_user_id", session.userId)
      .maybeSingle();
    return { avatar_url: (data?.avatar_url as string | null) ?? null };
  } catch {
    return { avatar_url: null as string | null };
  }
});

// ══════════════════════════════════════════════════════════════
// AUDIT LOG — REMOVED: adminWriteAuditLog was a public endpoint
// allowing arbitrary audit record injection. All audit writes now
// go through logAudit() in admin-ops.server.ts (internal helper).
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// EMAIL — Send + History
// ══════════════════════════════════════════════════════════════
export const adminSendEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
      type: z.enum(["transactional", "marketing"]).default("transactional"),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    try {
      const { sendTransactionalEmail } = await import("@/lib/email.server");
      const emailResult = await sendTransactionalEmail({
        to: data.to,
        subject: data.subject,
        html: data.body.replace(/\n/g, "<br>"),
      });
      const emailStatus = emailResult.sent ? "sent" : "failed";
      await db.from("communication_logs").insert({
        type: "email",
        recipient: data.to,
        subject: data.subject,
        body_preview: data.body.slice(0, 200),
        provider: "resend",
        status: emailStatus,
        error_message: emailResult.error || null,
        sent_at: emailResult.sent ? new Date().toISOString() : null,
      });
      if (!emailResult.sent)
        return {
          ok: false as const,
          message:
            emailResult.error ||
            "Email delivery failed. Check Resend API key and sender domain verification.",
        };
      return { ok: true as const };
    } catch (err: any) {
      await db.from("communication_logs").insert({
        type: "email",
        recipient: data.to,
        subject: data.subject,
        body_preview: data.body.slice(0, 200),
        provider: "resend",
        status: "failed",
        error_message: err.message,
      });
      return { ok: false as const, message: err.message };
    }
  });

export const adminListEmailHistory = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("messages.view");
    if (authError)
      return {
        logs: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db
      .from("communication_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .eq("type", "email");
    if (data?.search)
      query = query.or(`recipient.ilike.%${data.search}%,subject.ilike.%${data.search}%`);
    const { data: logs, count } = await query.range(from, to);
    const total = count ?? 0;
    return { logs: logs ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });

// ══════════════════════════════════════════════════════════════
// CONTACTS — Import from spreadsheet
// ══════════════════════════════════════════════════════════════
const COLUMN_ALIASES: Record<string, string> = {
  "first name": "first_name",
  firstname: "first_name",
  first_name: "first_name",
  "last name": "last_name",
  lastname: "last_name",
  last_name: "last_name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  phone_number: "phone",
  mobile: "phone",
  state: "state",
  lga: "lga",
  "local government": "lga",
  city: "city",
  town: "city",
  address: "address",
  "street address": "address",
  "marketing consent": "marketing_consent",
  consent: "marketing_consent",
  "opt-in": "marketing_consent",
};

function mapColumn(header: string): string | null {
  return COLUMN_ALIASES[header.toLowerCase().trim()] || null;
}

export const adminImportContacts = createServerFn({ method: "POST" })
  .validator(z.object({ rows: z.array(z.record(z.string())) }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("customers.edit");
    if (authError)
      return {
        ok: false as const,
        message: authError,
        imported: 0,
        skipped: 0,
        errors: [] as string[],
      };
    const db = createDatabaseClient();
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let duplicatesInFile = 0;
    let existingCustomers = 0;
    const seenEmails = new Set<string>();
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      // Map headers to known fields
      const mapped: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const field = mapColumn(key);
        if (field) mapped[field] = String(value || "").trim();
      }
      const email = mapped.email?.toLowerCase().trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row ${i + 1}: invalid email: ${mapped.email || "(empty)"}`);
        skipped++;
        continue;
      }
      // Check for duplicate within the same file
      if (seenEmails.has(email)) {
        duplicatesInFile++;
        errors.push(`Row ${i + 1}: duplicate email in file: ${email}`);
        skipped++;
        continue;
      }
      seenEmails.add(email);
      // Validate person names if provided
      if (mapped.first_name) {
        const { humanNameSchema } = await import("@/lib/validation");
        const r = humanNameSchema.safeParse(mapped.first_name);
        if (!r.success) {
          errors.push(`Row ${i + 1}: invalid first name — ${r.error.errors[0]?.message}`);
          skipped++;
          continue;
        }
      }
      if (mapped.last_name) {
        const { humanNameSchema } = await import("@/lib/validation");
        const r = humanNameSchema.safeParse(mapped.last_name);
        if (!r.success) {
          errors.push(`Row ${i + 1}: invalid last name — ${r.error.errors[0]?.message}`);
          skipped++;
          continue;
        }
      }
      // Check suppression — CSV import does NOT override suppression
      const { data: suppressed } = await db
        .from("marketing_suppression")
        .select("email")
        .eq("email", email)
        .maybeSingle();
      const isSuppressed = !!suppressed;
      // Upsert by normalized email
      const { data: existing } = await db
        .from("customers")
        .select("id, marketing_consent")
        .eq("email", email)
        .maybeSingle();
      const payload: Record<string, any> = {
        email,
        first_name: mapped.first_name || null,
        last_name: mapped.last_name || null,
        phone: mapped.phone || null,
        state: mapped.state || null,
        lga: mapped.lga || null,
        city: mapped.city || null,
        address: mapped.address || null,
      };
      if (existing) {
        existingCustomers++;
        // Update existing — preserve suppression state regardless of CSV values
        if (isSuppressed) {
          payload.marketing_consent = false;
        } else if (
          mapped.marketing_consent === "true" ||
          mapped.marketing_consent === "1" ||
          mapped.marketing_consent === "yes"
        ) {
          payload.marketing_consent = true;
          payload.marketing_consent_at = new Date().toISOString();
        }
        await db.from("customers").update(payload).eq("id", existing.id);
      } else {
        // New customer — suppressed emails get consent=false regardless of CSV
        if (isSuppressed) {
          payload.marketing_consent = false;
        } else if (
          mapped.marketing_consent === "true" ||
          mapped.marketing_consent === "1" ||
          mapped.marketing_consent === "yes"
        ) {
          payload.marketing_consent = true;
          payload.marketing_consent_at = new Date().toISOString();
        }
        await db.from("customers").insert(payload);
      }
      imported++;
    }
    logAudit("contacts.import", "contacts", undefined, {
      imported,
      skipped,
      errorCount: errors.length,
      duplicatesInFile,
      existingCustomers,
      totalRows: data.rows.length,
    });
    return {
      ok: true as const,
      imported,
      skipped,
      errors,
      totalRows: data.rows.length,
      validRows: imported,
      invalidRows: skipped,
      duplicatesInFile,
      existingCustomers,
    };
  });

// ══════════════════════════════════════════════════════════════
// RECIPIENT DIRECTORY — Aggregated contacts
// ══════════════════════════════════════════════════════════════
export const adminListRecipients = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.manage");
    if (authError)
      return {
        recipients: [] as any[],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        error: authError,
      };
    const db = createDatabaseClient();
    // Aggregate customers + newsletter_subscribers, dedupe by email
    const [customersResult, subsResult] = await Promise.all([
      db
        .from("customers")
        .select("email, first_name, last_name, phone, marketing_consent, created_at"),
      db
        .from("newsletter_subscribers")
        .select("email, created_at, is_active")
        .eq("is_active", true),
    ]);
    // Fetch suppressed emails
    const { data: suppressedRows } = await db.from("marketing_suppression").select("email");
    const suppressedEmails = new Set(
      (suppressedRows || []).map((s: any) => s.email?.toLowerCase().trim()).filter(Boolean),
    );
    const emailMap = new Map<string, any>();
    // Customers take priority
    for (const c of customersResult.data || []) {
      const email = c.email?.toLowerCase().trim();
      if (!email) continue;
      emailMap.set(email, {
        email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        source: "customer",
        marketing_consent: c.marketing_consent || false,
        suppressed: suppressedEmails.has(email),
        first_seen: c.created_at,
      });
    }
    // Newsletter subscribers fill in gaps
    for (const s of subsResult.data || []) {
      const email = s.email?.toLowerCase().trim();
      if (!email) continue;
      if (emailMap.has(email)) {
        const existing = emailMap.get(email);
        existing.source = existing.source === "customer" ? "customer,newsletter" : "newsletter";
        // Suppression overrides newsletter consent
        if (suppressedEmails.has(email)) existing.suppressed = true;
      } else {
        emailMap.set(email, {
          email,
          first_name: null, // newsletter_subscribers has no first_name column
          last_name: null,
          phone: null,
          source: "newsletter",
          marketing_consent: !suppressedEmails.has(email),
          suppressed: suppressedEmails.has(email),
          first_seen: s.created_at,
        });
      }
    }
    let recipients = Array.from(emailMap.values());
    if (data?.search) {
      const q = data.search.toLowerCase();
      recipients = recipients.filter(
        (r) =>
          r.email.includes(q) ||
          (r.first_name || "").toLowerCase().includes(q) ||
          (r.last_name || "").toLowerCase().includes(q) ||
          (r.phone || "").includes(q),
      );
    }
    const allRecipients = recipients;
    const total = allRecipients.length;
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 10;
    const from = (page - 1) * pageSize;
    const paged = allRecipients.slice(from, from + pageSize);
    return { recipients: paged, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });

// ══════════════════════════════════════════════════════════════
// MARKETING EMAIL — Bulk send via Brevo
// ══════════════════════════════════════════════════════════════
export const adminSendMarketingEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      recipients: z.array(
        z.object({ email: z.string().email(), first_name: z.string().optional().nullable() }),
      ),
      subject: z.string().min(1).max(200),
      body: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const brevoApiKey = process.env.BREVO_API_KEY?.trim();
    if (!brevoApiKey) {
      return {
        ok: false as const,
        message: "Brevo API key is not configured. Marketing email requires Brevo.",
      };
    }
    // Filter out suppressed emails before sending
    const { data: suppressedRows } = await db.from("marketing_suppression").select("email");
    const suppressedSet = new Set(
      (suppressedRows || []).map((s: any) => s.email?.toLowerCase().trim()).filter(Boolean),
    );
    const eligibleRecipients = data.recipients.filter(
      (r) => !suppressedSet.has(r.email.toLowerCase().trim()),
    );
    if (eligibleRecipients.length === 0) {
      return {
        ok: false as const,
        message: "All selected recipients are unsubscribed from marketing.",
      };
    }
    // Send per recipient through the provider chain (Brevo → Mailjet):
    // personalization is applied for real, and a definitive Brevo rejection
    // fails over to Mailjet instead of dropping the batch.
    const { sendMarketingEmail } = await import("@/lib/email-providers.server");
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const providerCounts: Record<string, number> = {};
    for (const r of eligibleRecipients) {
      const personal = {
        first: r.first_name || "there",
      };
      const html = data.body
        .replace(/\n/g, "<br>")
        .replace(/\{\{first_name\}\}/g, personal.first)
        .replace(/\{\{full_name\}\}/g, personal.first);
      const text = data.body
        .replace(/\{\{first_name\}\}/g, personal.first)
        .replace(/\{\{full_name\}\}/g, personal.first);
      try {
        const result = await sendMarketingEmail({
          // The provider layer resolves a VERIFIED Brevo sender (explicit env
          // → account's active sender). input.from is only a last-resort hint;
          // the hardcoded unverified domain fallback caused Brevo's
          // "sender … is not valid" rejection.
          from: process.env.BREVO_SENDER_EMAIL || "diplomatglobaltechs@gmail.com",
          to: r.email,
          subject: data.subject,
          html,
          text,
        });
        if (result.final.status === "sent") {
          sent += 1;
          providerCounts[result.final.provider] = (providerCounts[result.final.provider] || 0) + 1;
        } else {
          failed += 1;
          const detail = result.final.status === "failed" ? result.final.error : "not configured";
          errors.push(`${r.email}: ${detail.slice(0, 160)}`);
        }
      } catch (err: any) {
        failed += 1;
        errors.push(`${r.email}: ${err.message?.slice(0, 160)}`);
      }
    }
    // Log to communication_logs with the providers actually used
    const logStatus = sent > 0 ? "submitted" : failed > 0 ? "failed" : "rejected";
    const providerSummary = Object.entries(providerCounts)
      .map(([p, n]) => `${p}:${n}`)
      .join(", ");
    await db.from("communication_logs").insert({
      type: "email",
      recipient: `${data.recipients.length} recipients (marketing)`,
      subject: data.subject,
      body_preview: data.body.slice(0, 200),
      provider: providerSummary || "brevo",
      status: logStatus,
      error_message: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      sent_at: sent > 0 ? new Date().toISOString() : null,
    });
    logAudit("email.marketing", "email", undefined, {
      recipients: data.recipients.length,
      sent,
      failed,
    });
    // Notification for Brevo failure
    if (failed > 0) {
      try {
        const { notifications } = await import("@/lib/notifications");
        await notifications.brevoFailure(
          `marketing to ${data.recipients.length} recipients`,
          errors.join("; ").slice(0, 200),
        );
      } catch (_) {}
    }
    return {
      ok: sent > 0,
      message:
        sent > 0
          ? `Queued for ${sent} recipient${sent !== 1 ? "s" : ""}${failed > 0 ? `. ${failed} failed.` : ""}${providerCounts.mailjet ? ` (${providerCounts.mailjet} via Mailjet fallback).` : "."}`
          : `All ${failed} recipient${failed !== 1 ? "s" : ""} failed. Check sender domain verification and provider configuration.`,
      sent,
      failed,
      errors,
    };
  });

// ══════════════════════════════════════════════════════════════
// SECURITY EVENTS — For notification bell
// ══════════════════════════════════════════════════════════════
export const adminListSecurityEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
  const authError = await requirePermission("audit.view");
  if (authError) return { events: [] as any[], total: 0 };
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("audit_logs")
    .select("id, clerk_user_id, action, entity_type, metadata, ip_address, created_at")
    .eq("entity_type", "security")
    .in("action", ["unauthorized_admin_access", "inactive_admin_access"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return { events: [] as any[], total: 0 };
  return { events: data || [], total: (data || []).length };
});

// ══════════════════════════════════════════════════════════════
// SECURITY EVENT LOGGING — Called from dashboard.tsx boundary guard
// ══════════════════════════════════════════════════════════════
/**
 * SECURITY EVENT LOGGING — Hardened server function.
 *
 * REQUIRES Clerk authentication. Rejects unauthenticated callers.
 * Uses strict event allowlist — arbitrary actions are rejected.
 * All identity fields (user ID, session, IP, timestamp) are server-derived.
 * Metadata is bounded and sanitized.
 * Rate-limited to prevent log poisoning / audit spam.
 *
 * Allowed events (client calls only these):
 * - admin_session_started: dashboard boundary initial load
 * - admin_session_ended: explicit logout
 * - inactive_admin_access: inactive admin attempted access
 * - unauthorized_admin_access: unauthorized user accessed admin
 */
const ALLOWED_SECURITY_EVENTS = new Set([
  "admin_session_started",
  "admin_session_ended",
  "inactive_admin_access",
  "unauthorized_admin_access",
]);

// Simple in-memory dedup: prevent >1 identical event per session within 5s
const _securityEventDedup = new Map<string, number>();
const SECURITY_DEDUP_MS = 5_000;

export const adminLogSecurityEvent = createServerFn({ method: "POST" })
  .validator(
    z.object({
      action: z.string().max(100),
      metadata: z.record(z.any()).optional().default({}),
    }),
  )
  .handler(async ({ data }) => {
    // ── Reject non-allowlisted events ──
    if (!ALLOWED_SECURITY_EVENTS.has(data.action)) {
      return { ok: false as const, reason: "event_not_allowed" };
    }

    // ── Require Clerk authentication ──
    const { auth } = await import("@clerk/tanstack-react-start/server");
    const session = await auth();
    if (!session?.userId) {
      return { ok: false as const, reason: "not_authenticated" };
    }

    // ── Rate-limit (dedup within 5s window) ──
    const dedupKey = `${session.userId}:${data.action}:${session.sessionId || ""}`;
    const now = Date.now();
    const lastEvent = _securityEventDedup.get(dedupKey) || 0;
    if (now - lastEvent < SECURITY_DEDUP_MS) {
      return { ok: true as const, skipped: true };
    }
    _securityEventDedup.set(dedupKey, now);
    // Cleanup old entries periodically
    if (_securityEventDedup.size > 200) {
      for (const [k, v] of _securityEventDedup) {
        if (now - v > 60_000) _securityEventDedup.delete(k);
      }
    }

    const { createDatabaseClient } = await import("./admin-ops.server");
    const { getRequestIP, getRequestHeaders } = await import("@tanstack/react-start/server");
    const db = createDatabaseClient();

    const userId = session.userId;
    const sessionId = session.sessionId || null;

    // ── Session-based dedup for admin_session_started ──
    if (data.action === "admin_session_started" && sessionId) {
      const { data: existing } = await db
        .from("audit_logs")
        .select("id")
        .eq("action", "admin_session_started")
        .eq("clerk_user_id", userId)
        .filter("metadata->>session_id", "eq", sessionId)
        .limit(1);
      if (existing && existing.length > 0) return { ok: true as const, skipped: true };
    }

    // ── Server-derived IP and user-agent ──
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const raw = getRequestIP({ xForwardedFor: true });
      if (raw && typeof raw === "string") {
        const firstIp = raw.trim().split(",")[0]?.trim();
        if (
          firstIp &&
          (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(firstIp) || /^[0-9a-fA-F:]+$/.test(firstIp))
        ) {
          ip = firstIp;
        }
      }
      const headers = getRequestHeaders() as unknown as Record<string, string | undefined> | null;
      const rawUa = headers?.["user-agent"];
      if (typeof rawUa === "string" && rawUa.length > 0 && rawUa.length < 512) ua = rawUa;
    } catch {
      /* best-effort */
    }

    // ── Sanitize metadata: bound size, strip dangerous keys ──
    const safeMetadata: Record<string, unknown> = {};
    const META_KEYS_ALLOWLIST = ["reason", "result", "route", "method", "role", "session_id"];
    for (const key of META_KEYS_ALLOWLIST) {
      if (data.metadata[key] !== undefined) {
        const val = data.metadata[key];
        safeMetadata[key] = typeof val === "string" ? val.slice(0, 500) : val;
      }
    }
    safeMetadata.session_id = sessionId;

    // ── Server-authoritative actor attribution ──
    // Resolve the real admin name + explicit role from admin_users/Clerk so
    // session lifecycle events display real identity (never an email prefix).
    const { resolveAuditActor } = await import("./admin-ops.server");
    const actor = await resolveAuditActor(db, userId);
    safeMetadata.display_name = actor.displayName ?? "Name not provided";
    if (actor.role) safeMetadata.role = actor.role;
    if (actor.adminId) safeMetadata.admin_id = actor.adminId;

    await db.from("audit_logs").insert({
      clerk_user_id: userId,
      action: data.action,
      entity_type: "security",
      entity_id: null,
      metadata: safeMetadata,
      ip_address: ip,
      user_agent: ua,
    });
    return { ok: true as const };
  });

// ══════════════════════════════════════════════════════════════
// SECURITY NOTIFICATION READ STATE — Per-admin persistent reads
// ══════════════════════════════════════════════════════════════

/** Get current admin's ID from Clerk session */
async function getCurrentAdminId(): Promise<string | null> {
  try {
    const { auth } = await import("@clerk/tanstack-react-start/server");
    const session = await auth();
    if (!session?.userId) return null;
    const { createDatabaseClient } = await import("./admin-ops.server");
    const db = createDatabaseClient();
    const { data } = await db
      .from("admin_users")
      .select("id")
      .eq("clerk_user_id", session.userId)
      .maybeSingle();
    return data?.id || null;
  } catch {
    return null;
  }
}

/** List security notifications with per-admin read state */
export const adminListSecurityNotifications = createServerFn({ method: "GET" }).handler(
  async () => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("audit.view");
    if (authError) return { notifications: [] as any[], unreadCount: 0 };
    const db = createDatabaseClient();
    const adminId = await getCurrentAdminId();

    // Get security events that should appear as notifications
    const { data: events } = await db
      .from("audit_logs")
      .select("id, clerk_user_id, action, metadata, ip_address, created_at")
      .eq("entity_type", "security")
      .in("action", [
        "unauthorized_admin_access",
        "inactive_admin_access",
        "admin_permission_denied",
      ])
      .order("created_at", { ascending: false })
      .limit(20);

    if (!events || events.length === 0 || !adminId) {
      return { notifications: events || [], unreadCount: 0 };
    }

    // Get read state for current admin
    const eventIds = events.map((e) => e.id);
    const { data: reads } = await db
      .from("admin_notification_reads")
      .select("audit_log_id")
      .eq("admin_user_id", adminId)
      .in("audit_log_id", eventIds);

    const readSet = new Set((reads || []).map((r) => r.audit_log_id));
    const notifications = events.map((e) => ({
      ...e,
      isRead: readSet.has(e.id),
    }));
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return { notifications, unreadCount };
  },
);

/** Mark a single security notification as read for current admin */
export const adminMarkNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ audit_log_id: z.number() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("audit.view");
    if (authError) return { ok: false as const };
    const adminId = await getCurrentAdminId();
    if (!adminId) return { ok: false as const };
    const db = createDatabaseClient();
    // Upsert — idempotent
    await db
      .from("admin_notification_reads")
      .upsert(
        { admin_user_id: adminId, audit_log_id: data.audit_log_id },
        { onConflict: "admin_user_id,audit_log_id" },
      );
    return { ok: true as const };
  });

/** Mark all unread security notifications as read for current admin */
export const adminMarkAllNotificationsRead = createServerFn({ method: "POST" }).handler(
  async () => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("audit.view");
    if (authError) return { ok: false as const };
    const adminId = await getCurrentAdminId();
    if (!adminId) return { ok: false as const };
    const db = createDatabaseClient();
    // Get all unread security notification IDs for this admin
    const { data: events } = await db
      .from("audit_logs")
      .select("id")
      .eq("entity_type", "security")
      .in("action", [
        "unauthorized_admin_access",
        "inactive_admin_access",
        "admin_permission_denied",
      ]);
    if (!events || events.length === 0) return { ok: true as const, marked: 0 };
    const eventIds = events.map((e) => e.id);
    // Get already-read IDs
    const { data: existing } = await db
      .from("admin_notification_reads")
      .select("audit_log_id")
      .eq("admin_user_id", adminId)
      .in("audit_log_id", eventIds);
    const readSet = new Set((existing || []).map((r) => r.audit_log_id));
    const unread = eventIds.filter((id) => !readSet.has(id));
    if (unread.length === 0) return { ok: true as const, marked: 0 };
    // Bulk insert read receipts
    const rows = unread.map((id) => ({ admin_user_id: adminId, audit_log_id: id }));
    await db.from("admin_notification_reads").insert(rows);
    return { ok: true as const, marked: unread.length };
  },
);

// ══════════════════════════════════════════════════════════════
// PERMISSION DENIED AUDITING
// ══════════════════════════════════════════════════════════════
// AUDIT LOG — REMOVED: adminLogPermissionDenied was a public endpoint
// allowing external callers to inject arbitrary permission-denied events.
// Permission denials are now logged internally via requirePermission()
// in admin-ops.server.ts which uses logAudit() directly.
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// MARKETING UNSUBSCRIBE / RESUBSCRIBE
// ══════════════════════════════════════════════════════════════

/**
 * Admin unsubscribes a customer from marketing.
 * Sets marketing_consent=false AND adds to marketing_suppression.
 * Does NOT delete customer, orders, or receipts.
 */
export const adminUnsubscribeCustomer = createServerFn({ method: "POST" })
  .validator(z.object({ customer_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("customers.edit", {
      auditOnDenial: true,
      context: "unsubscribe customer from marketing",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    // Fetch customer
    const { data: customer } = await db
      .from("customers")
      .select("id, email, marketing_consent")
      .eq("id", data.customer_id)
      .single();
    if (!customer) return { ok: false as const, message: "Customer not found." };
    const normalizedEmail = customer.email.toLowerCase().trim();
    // Set marketing_consent=false
    await db
      .from("customers")
      .update({
        marketing_consent: false,
        marketing_unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", data.customer_id);
    // Deactivate matching newsletter subscriber (cross-source unsubscribe)
    await db
      .from("newsletter_subscribers")
      .update({
        is_active: false,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("email", normalizedEmail);
    // Add to suppression (idempotent via unique index)
    await db.from("marketing_suppression").upsert(
      {
        email: normalizedEmail,
        reason: "unsubscribed",
        source: "admin_action",
      },
      { onConflict: "email" },
    );
    logAudit("customer.unsubscribe", "customer", data.customer_id, {
      email: customer.email,
      reason: "admin_action",
    });
    return {
      ok: true as const,
      message: "Customer unsubscribed from marketing. Customer record and order history preserved.",
    };
  });

/**
 * Admin resubscribes a customer to marketing.
 * Requires explicit action — does NOT silently resubscribe.
 * Removes from marketing_suppression.
 */
export const adminResubscribeCustomer = createServerFn({ method: "POST" })
  .validator(z.object({ customer_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("customers.edit", {
      auditOnDenial: true,
      context: "resubscribe customer to marketing",
    });
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { data: customer } = await db
      .from("customers")
      .select("id, email")
      .eq("id", data.customer_id)
      .single();
    if (!customer) return { ok: false as const, message: "Customer not found." };
    const normalizedEmail = customer.email.toLowerCase().trim();
    // Set marketing_consent=true with new consent timestamp
    await db
      .from("customers")
      .update({
        marketing_consent: true,
        marketing_consent_at: new Date().toISOString(),
        marketing_unsubscribed_at: null,
      })
      .eq("id", data.customer_id);
    // Reactivate matching newsletter subscriber if exists (explicit consent)
    await db
      .from("newsletter_subscribers")
      .update({
        is_active: true,
        unsubscribed_at: null,
      })
      .eq("email", normalizedEmail);
    // Remove from suppression
    await db.from("marketing_suppression").delete().eq("email", normalizedEmail);
    logAudit("customer.resubscribe", "customer", data.customer_id, {
      email: customer.email,
      reason: "admin_action",
      consent_timestamp: new Date().toISOString(),
    });
    return {
      ok: true as const,
      message: "Customer resubscribed to marketing with explicit consent.",
    };
  });

/**
 * Public unsubscribe endpoint. Uses secure UUID token.
 * Token is looked up in customers.unsubscribe_token.
 * Sets marketing_consent=false + adds to suppression.
 */
export const publicUnsubscribe = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().uuid() }))
  .handler(async ({ data }) => {
    try {
      const { createDatabaseClient, getDatabaseConfig } = await import("./admin-ops.server");
      if (!getDatabaseConfig()) return { ok: false as const, message: "Service unavailable." };
      const db = createDatabaseClient();
      // Look up by unsubscribe token
      const { data: customer } = await db
        .from("customers")
        .select("id, email, marketing_consent")
        .eq("unsubscribe_token", data.token)
        .maybeSingle();
      if (!customer) {
        // Also check newsletter_subscribers
        const { data: sub } = await db
          .from("newsletter_subscribers")
          .select("id, email, is_active")
          .eq("unsubscribe_token", data.token)
          .maybeSingle();
        if (!sub) return { ok: false as const, message: "Invalid or expired unsubscribe link." };
        // Deactivate newsletter subscription
        await db
          .from("newsletter_subscribers")
          .update({
            is_active: false,
            unsubscribed_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        // Also update customer marketing_consent if customer exists with same email
        await db
          .from("customers")
          .update({
            marketing_consent: false,
            marketing_unsubscribed_at: new Date().toISOString(),
          })
          .eq("email", sub.email.toLowerCase().trim());
        // Add to suppression
        await db.from("marketing_suppression").upsert(
          {
            email: sub.email.toLowerCase().trim(),
            reason: "unsubscribed",
            source: "public_unsubscribe",
          },
          { onConflict: "email" },
        );
        return {
          ok: true as const,
          message:
            "You have been unsubscribed from marketing emails. You will no longer receive promotional communications from Diplomat Global.",
        };
      }
      const normalizedEmail = customer.email.toLowerCase().trim();
      // Set marketing_consent=false
      await db
        .from("customers")
        .update({
          marketing_consent: false,
          marketing_unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", customer.id);
      // Deactivate matching newsletter subscriber (cross-source)
      await db
        .from("newsletter_subscribers")
        .update({
          is_active: false,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("email", normalizedEmail);
      // Add to suppression
      await db.from("marketing_suppression").upsert(
        {
          email: normalizedEmail,
          reason: "unsubscribed",
          source: "public_unsubscribe",
        },
        { onConflict: "email" },
      );
      return {
        ok: true as const,
        message:
          "You have been unsubscribed from marketing emails. You will no longer receive promotional communications from Diplomat Global.",
      };
    } catch (err) {
      console.error("[unsubscribe] Error:", err);
      return { ok: false as const, message: "An error occurred. Please try again." };
    }
  });

/**
 * Generate a secure unsubscribe URL for a customer.
 * Used by admin to include in marketing emails.
 */
export const adminGetUnsubscribeUrl = createServerFn({ method: "GET" })
  .validator(z.object({ customer_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("newsletter.manage");
    if (authError) return { url: "" };
    const db = createDatabaseClient();
    const { data: customer } = await db
      .from("customers")
      .select("unsubscribe_token")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (!customer?.unsubscribe_token) return { url: "" };
    const { getUnsubscribeUrl } = await import("@/lib/site-origin.server");
    return { url: getUnsubscribeUrl(customer.unsubscribe_token) };
  });

// ══════════════════════════════════════════════════════════════
// OPERATIONAL NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

/** Create a notification (server-side only, deduplicated by event_key) */
export const createNotification = createServerOnlyFn(
  async (opts: {
    eventKey: string;
    category: string;
    severity?: string;
    title: string;
    message?: string;
    targetUrl?: string;
    permissionKey?: string;
    metadata?: Record<string, any>;
  }): Promise<void> => {
    try {
      const { createDatabaseClient } = await import("./admin-ops.server");
      const db = createDatabaseClient();
      // Upsert with dedup: if an active (unresolved) notification with this event_key exists, skip
      const { error } = await db.from("admin_notifications").upsert(
        {
          event_key: opts.eventKey,
          category: opts.category,
          severity: opts.severity || "info",
          title: opts.title,
          message: opts.message || null,
          target_url: opts.targetUrl || null,
          permission_key: opts.permissionKey || null,
          metadata: opts.metadata || {},
        },
        { onConflict: "event_key", ignoreDuplicates: true },
      );
      if (error) {
        // Notification creation failure must never break the calling operation
        console.error("[Notification] Failed to create:", error.message);
      }
    } catch (err: any) {
      console.error("[Notification] Creation error:", err?.message);
    }
  },
);

/** List notifications for current admin, respecting permission_key */
export const adminListNotifications = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
        unreadOnly: z.boolean().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    // No specific permission needed — all authenticated admins see notifications appropriate to their permissions
    const adminId = await getCurrentAdminId();
    if (!adminId) return { notifications: [] as any[], total: 0, unreadCount: 0 };
    const db = createDatabaseClient();
    const page = data?.page || 1;
    const pageSize = data?.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Get current admin's permissions for RBAC filtering
    let adminPerms: string[] = [];
    try {
      const { data: adminUser } = await db
        .from("admin_users")
        .select("role_id, active")
        .eq("id", adminId)
        .single();
      if (!adminUser?.active) return { notifications: [], total: 0, unreadCount: 0 };
      const { data: rolePerms } = await db
        .from("role_permissions")
        .select("permissions!inner(key)")
        .eq("role_id", adminUser.role_id);
      adminPerms = (rolePerms || []).map((rp: any) => rp.permissions?.key).filter(Boolean);
    } catch {
      // Permission fetch failed — show only unrestricted notifications
    }

    // Fetch notifications: permission_key IS NULL (all admins) OR permission_key IN adminPerms
    const query = db
      .from("admin_notifications")
      .select("*", { count: "exact" })
      .or(`permission_key.is.null,permission_key.in.(${adminPerms.join(",")})`)
      .is("resolved_at", null)
      .order("created_at", { ascending: false });

    if (data?.unreadOnly) {
      // We'll filter unread after getting read state
    }

    const { data: notifications, count } = await query.range(from, to);
    const total = count ?? 0;

    if (!notifications || notifications.length === 0) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    // Get read state for current admin
    const notifIds = notifications.map((n: any) => n.id);
    const { data: reads } = await db
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_user_id", adminId)
      .in("notification_id", notifIds);
    const readSet = new Set((reads || []).map((r: any) => r.notification_id));

    const enriched = notifications.map((n: any) => ({
      ...n,
      isRead: readSet.has(n.id),
    }));

    // Count total unread (from all pages)
    const { count: unreadCount } = await db
      .from("admin_notifications")
      .select("*", { count: "exact", head: true })
      .or(`permission_key.is.null,permission_key.in.(${adminPerms.join(",")})`)
      .is("resolved_at", null);

    // Get read IDs for unread count
    const { data: allReads } = await db
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_user_id", adminId);
    const allReadSet = new Set((allReads || []).map((r) => r.notification_id));

    // Filter unresolved notifications to count unread
    const { data: allNotifs } = await db
      .from("admin_notifications")
      .select("id")
      .or(`permission_key.is.null,permission_key.in.(${adminPerms.join(",")})`)
      .is("resolved_at", null);
    const actualUnread = (allNotifs || []).filter((n) => !allReadSet.has(n.id)).length;

    return { notifications: enriched, total, unreadCount: actualUnread };
  });

/** Mark a single notification as read */
export const adminMarkNotificationReadById = createServerFn({ method: "POST" })
  .validator(z.object({ notification_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const adminId = await getCurrentAdminId();
    if (!adminId) return { ok: false as const };
    const db = createDatabaseClient();
    await db
      .from("admin_notification_reads")
      .upsert(
        { admin_user_id: adminId, notification_id: data.notification_id },
        { onConflict: "admin_user_id,notification_id" },
      );
    return { ok: true as const };
  });

/** Mark ALL notifications as read for current admin */
export const adminMarkAllNotificationsReadById = createServerFn({ method: "POST" }).handler(
  async () => {
    const { createDatabaseClient } = await import("./admin-ops.server");
    const adminId = await getCurrentAdminId();
    if (!adminId) return { ok: false as const, marked: 0 };
    const db = createDatabaseClient();
    // Get all unresolved notification IDs
    const { data: notifs } = await db
      .from("admin_notifications")
      .select("id")
      .is("resolved_at", null);
    if (!notifs || notifs.length === 0) return { ok: true as const, marked: 0 };
    const notifIds = notifs.map((n: any) => n.id);
    // Get already-read IDs
    const { data: existing } = await db
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_user_id", adminId)
      .in("notification_id", notifIds);
    const readSet = new Set((existing || []).map((r: any) => r.notification_id));
    const unread = notifIds.filter((id: string) => !readSet.has(id));
    if (unread.length === 0) return { ok: true as const, marked: 0 };
    const rows = unread.map((id: string) => ({ admin_user_id: adminId, notification_id: id }));
    await db.from("admin_notification_reads").insert(rows);
    return { ok: true as const, marked: unread.length };
  },
);

/** Resolve/dismiss a notification (owner/admin only) */
export const adminResolveNotification = createServerFn({ method: "POST" })
  .validator(z.object({ notification_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("settings.manage");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    await db
      .from("admin_notifications")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.notification_id);
    return { ok: true as const };
  });

// ── Transaction Detail ────────────────────────────────────────
export const adminGetTransactionDetail = createServerFn({ method: "GET" })
  .validator(z.object({ transaction_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("payments.view");
    if (authError) return { transaction: null, error: authError };
    const db = createDatabaseClient();
    const { data: txn, error } = await db
      .from("payment_transactions")
      .select("*, orders(*, customers(*), order_items(*), receipts(*))")
      .eq("id", data.transaction_id)
      .single();
    if (error || !txn) return { transaction: null, error: "Transaction not found" };
    return { transaction: txn };
  });

// ── Customer Detail ───────────────────────────────────────────
export const adminGetCustomerDetail = createServerFn({ method: "GET" })
  .validator(z.object({ customer_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("customers.view");
    if (authError) return { customer: null, error: authError };
    const db = createDatabaseClient();
    const { data: customer, error } = await db
      .from("customers")
      .select("*")
      .eq("id", data.customer_id)
      .single();
    if (error || !customer) return { customer: null, error: "Customer not found" };
    const { data: orders } = await db
      .from("orders")
      .select("*, order_items(*), receipts(*), payment_transactions(*)")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false });
    const { data: reviews } = await db
      .from("reviews")
      .select("*, products(name, sku)")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false })
      .limit(10);
    const totalSpend = (orders || [])
      .filter((o: any) => o.status === "paid")
      .reduce((sum: number, o: any) => sum + Number(o.total), 0);
    return {
      customer,
      orders: orders || [],
      reviews: reviews || [],
      totalSpend,
      totalOrders: orders?.length || 0,
    };
  });

// ── Privacy Requests ───────────────────────────────────────
export const adminListPrivacyRequests = createServerFn({ method: "GET" })
  .validator(z.object({ status: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { requests: [] as any[], error: authError };
    const db = createDatabaseClient();
    let query = db
      .from("privacy_requests")
      .select("*, customers(email, first_name, last_name)")
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: requests } = await query;
    return { requests: requests || [] };
  });

export const adminUpdatePrivacyRequest = createServerFn({ method: "POST" })
  .validator(
    z.object({
      request_id: z.string().uuid(),
      status: z.enum(["reviewing", "approved", "rejected", "completed"]),
      reviewer_notes: z.string().optional(),
      retained_records: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requireOwner, logAudit } = await import("./admin-ops.server");
    const authError = await requireOwner();
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const session = await (await import("./admin-ops.server")).auth();
    const updates: any = {
      status: data.status,
      reviewer_id: session?.userId,
      reviewer_notes: data.reviewer_notes,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "approved" || data.status === "rejected")
      updates.decision_at = new Date().toISOString();
    if (data.status === "completed") {
      updates.completed_at = new Date().toISOString();
      updates.retained_records = data.retained_records || [];
      // Anonymize customer data
      const { data: req } = await db
        .from("privacy_requests")
        .select("customer_id")
        .eq("id", data.request_id)
        .single();
      if (req?.customer_id) {
        await db
          .from("customers")
          .update({
            first_name: "REDACTED",
            last_name: "REDACTED",
            email: `redacted-${req.customer_id.slice(0, 8)}@anonymized.local`,
            phone: null,
          })
          .eq("id", req.customer_id);
        logAudit("privacy.erasure_completed", "customer", req.customer_id, {
          retained: data.retained_records,
        });
      }
    }
    const { error } = await db.from("privacy_requests").update(updates).eq("id", data.request_id);
    if (error) return { ok: false as const, message: error.message };
    logAudit("privacy.request_updated", "privacy_request", data.request_id, {
      status: data.status,
    });
    return { ok: true as const };
  });

// ── Refund Workflow ─────────────────────────────────────────
export const adminListRefunds = createServerFn({ method: "GET" })
  .validator(z.object({ status: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("payments.view");
    if (authError) return { refunds: [] as any[], error: authError };
    const db = createDatabaseClient();
    const query = db
      .from("payment_transactions")
      .select(
        "*, orders(reference, email, customers(first_name, last_name), order_items(name, sku, quantity, unit_price))",
      )
      .in("status", ["successful", "refunded"])
      .order("created_at", { ascending: false });
    const { data: transactions } = await query;
    return { refunds: transactions || [] };
  });

// ─── Global Admin Search ────────────────────────────────────────────────
// Searches across products (name/SKU), orders (reference/number),
// transactions (reference), customers (name/email/phone), and blog posts.
// Enforces RBAC: each entity type requires its own permission.
// Returns bounded results (max 5 per entity type, max 20 total).

export const adminGlobalSearch = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, requireAdmin } =
      await import("./admin-ops.server");
    // Require authentication (any active admin)
    const authErr = await requireAdmin();
    if (authErr) return { results: [] as any[], error: "Search unavailable" };
    // Rate-limit search to prevent abuse
    try {
      const { checkRateLimit } = await import("@/lib/rate-limit.server");
      const { auth } = await import("@clerk/tanstack-react-start/server");
      const session = await auth();
      const rl = await checkRateLimit("admin-search", session?.userId || undefined);
      if (rl.configured && !rl.success) return { results: [] as any[], rateLimited: true };
    } catch {
      /* non-critical */
    }
    const db = createDatabaseClient();
    const term = data.q.trim().replace(/[,%()]/g, " ");
    if (!term.trim()) return { results: [] as any[] };
    const like = `%${term}%`;
    const MAX_PER_ENTITY = 5;

    type SearchResult = {
      type: string;
      id: string;
      title: string;
      subtitle: string;
      url: string;
    };

    const results: SearchResult[] = [];

    // Products — requires products.view
    const productErr = await requirePermission("products.view");
    if (!productErr) {
      const { data: products, error } = await db
        .from("products")
        .select("id, slug, name, sku")
        .or(`name.ilike.${like},sku.ilike.${like},slug.ilike.${like}`)
        .limit(MAX_PER_ENTITY);
      if (error) throw new Error("Search unavailable. Please retry.");
      for (const p of products ?? []) {
        results.push({
          type: "product",
          id: p.id,
          title: p.name,
          subtitle: p.sku ? `SKU: ${p.sku}` : p.slug,
          url: `/dashboard/products?detail=${p.id}`,
        });
      }
    }

    // Orders — requires orders.view
    const orderErr = await requirePermission("orders.view");
    if (!orderErr) {
      const { data: orders, error } = await db
        .from("orders")
        .select("id, reference, status, customers(first_name, last_name, email)")
        .or(`reference.ilike.${like},email.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(MAX_PER_ENTITY);
      if (error) throw new Error("Search unavailable. Please retry.");
      for (const o of orders ?? []) {
        const ord = o as any;
        const customerName = ord.customers
          ? `${ord.customers.first_name || ""} ${ord.customers.last_name || ""}`.trim()
          : "";
        results.push({
          type: "order",
          id: o.id,
          title: `Order ${o.reference ?? o.id}`,
          subtitle: customerName || o.status,
          url: `/dashboard/orders/${o.id}`,
        });
      }
    }

    // Transactions — requires payments.view
    const paymentErr = await requirePermission("payments.view");
    if (!paymentErr) {
      const { data: txns, error } = await db
        .from("payment_transactions")
        .select("id, reference, status, amount")
        .or(`reference.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(MAX_PER_ENTITY);
      if (error) throw new Error("Search unavailable. Please retry.");
      for (const t of txns ?? []) {
        results.push({
          type: "transaction",
          id: t.id,
          title: `Payment ${t.reference ?? t.id}`,
          subtitle: `${t.status} — ₦${Number(t.amount).toLocaleString()}`,
          url: `/dashboard/transactions/${t.id}`,
        });
      }
    }

    // Customers — requires customers.view
    const customerErr = await requirePermission("customers.view");
    if (!customerErr) {
      const { data: customers, error } = await db
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .or(
          `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
        )
        .order("created_at", { ascending: false })
        .limit(MAX_PER_ENTITY);
      if (error) throw new Error("Search unavailable. Please retry.");
      for (const c of customers ?? []) {
        const cust = c as any;
        const name = `${cust.first_name || ""} ${cust.last_name || ""}`.trim();
        results.push({
          type: "customer",
          id: cust.id,
          title: name || "Not provided",
          subtitle: cust.email || cust.phone || "",
          url: `/dashboard/customers/${cust.id}`,
        });
      }
    }

    // Blog — requires pages.view or products.view (low sensitivity)
    const pageErr = await requirePermission("blog.manage");
    if (!pageErr) {
      const { data: posts, error } = await db
        .from("blog_posts")
        .select("id, slug, title")
        .or(`title.ilike.${like},slug.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(MAX_PER_ENTITY);
      if (error) throw new Error("Search unavailable. Please retry.");
      for (const b of posts ?? []) {
        results.push({
          type: "blog",
          id: b.id,
          title: b.title,
          subtitle: "Blog post",
          url: `/dashboard/blog`,
        });
      }
    }

    // Bounded total: max 20 results
    return { results: results.slice(0, 20) };
  });

// ─── Expenses CRUD ─────────────────────────────────────────────────────

export const adminListExpenses = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        category: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("expenses.view");
    if (authError) return { expenses: [] as any[], total: 0, error: authError };
    const db = createDatabaseClient();
    const from = ((data?.page ?? 1) - 1) * (data?.pageSize ?? 20);
    const to = from + (data?.pageSize ?? 20) - 1;
    let query = db.from("expenses").select("*", { count: "exact" });
    if (data?.category) query = query.eq("category", data.category);
    if (data?.from) query = query.gte("date", data.from);
    if (data?.to) query = query.lte("date", data.to);
    query = query.order("date", { ascending: false }).range(from, to);
    const { data: expenses, count } = await query;
    return { expenses: expenses ?? [], total: count ?? 0 };
  });

export const adminCreateExpense = createServerFn({ method: "POST" })
  .validator(
    z.object({
      date: z.string(),
      category: z.string(),
      amount: z.number().min(0),
      description: z.string().min(1),
      vendor: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("expenses.create");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("expenses").insert({
      date: data.date,
      category: data.category,
      amount: data.amount,
      description: data.description,
      vendor: data.vendor || null,
    });
    if (error) return { ok: false as const, message: error.message };
    logAudit("expense.create", "expenses", undefined, {
      category: data.category,
      amount: data.amount,
    });
    return { ok: true as const };
  });

export const adminDeleteExpense = createServerFn({ method: "POST" })
  .validator(z.object({ expense_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("expenses.delete");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const { error } = await db.from("expenses").delete().eq("id", data.expense_id);
    if (error) return { ok: false as const, message: error.message };
    logAudit("expense.delete", "expenses", data.expense_id);
    return { ok: true as const };
  });

export const adminUpdateExpense = createServerFn({ method: "POST" })
  .validator(
    z.object({
      expense_id: z.string().uuid(),
      date: z.string().optional(),
      category: z.string().optional(),
      amount: z.number().min(0).optional(),
      description: z.string().min(1).optional(),
      vendor: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission, logAudit } =
      await import("./admin-ops.server");
    const authError = await requirePermission("expenses.edit");
    if (authError) return { ok: false as const, message: authError };
    const db = createDatabaseClient();
    const updates: Record<string, unknown> = {};
    if (data.date !== undefined) updates.date = data.date;
    if (data.category !== undefined) updates.category = data.category;
    if (data.amount !== undefined) updates.amount = data.amount;
    if (data.description !== undefined) updates.description = data.description;
    if (data.vendor !== undefined) updates.vendor = data.vendor || null;
    if (Object.keys(updates).length === 0)
      return { ok: false as const, message: "No fields to update." };
    const { error } = await db.from("expenses").update(updates).eq("id", data.expense_id);
    if (error) return { ok: false as const, message: error.message };
    logAudit("expense.update", "expenses", data.expense_id, updates);
    return { ok: true as const };
  });

// ─── Enhanced Sales Analytics ───────────────────────────────────────────
// Period-based financial analytics with COGS and expenses.
// Returns: gross sales, net sales, refunds, COGS, gross profit, expenses, net profit.

export const adminGetSalesAnalytics = createServerFn({ method: "GET" })
  .validator(
    z.object({
      period: z
        .enum(["today", "week", "month", "prev_month", "ytd", "prev_year", "all"])
        .default("month"),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("analytics.view");
    if (authError) return { data: null, error: authError };
    const db = createDatabaseClient();

    // Calculate date range based on period
    const now = new Date();
    let startDate: string;
    let endDate: string = now.toISOString();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (data.period) {
      case "today": {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate = d.toISOString();
        break;
      }
      case "week": {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString();
        break;
      }
      case "month":
        startDate = new Date(y, m, 1).toISOString();
        break;
      case "prev_month":
        startDate = new Date(y, m - 1, 1).toISOString();
        endDate = new Date(y, m, 0, 23, 59, 59).toISOString();
        break;
      case "ytd":
        startDate = new Date(y, 0, 1).toISOString();
        break;
      case "prev_year":
        startDate = new Date(y - 1, 0, 1).toISOString();
        endDate = new Date(y - 1, 11, 31, 23, 59, 59).toISOString();
        break;
      case "all":
        startDate = new Date(2020, 0, 1).toISOString();
        break;
      default:
        startDate = new Date(y, m, 1).toISOString();
    }

    if (data.from) startDate = data.from;
    if (data.to) endDate = data.to;

    const [ordersResult, refundsResult, expensesResult, itemsResult, monthlyResult] =
      await Promise.all([
        // Paid orders in period
        db
          .from("orders")
          .select("id, total, status, created_at")
          .in("status", ["paid", "processing", "shipped", "delivered"])
          .gte("created_at", startDate)
          .lte("created_at", endDate),
        // Refunded orders in period
        db
          .from("payment_transactions")
          .select("amount")
          .eq("status", "refunded")
          .gte("created_at", startDate)
          .lte("created_at", endDate),
        // Expenses in period
        db
          .from("expenses")
          .select("amount, category")
          .gte("date", startDate.slice(0, 10))
          .lte("date", endDate.slice(0, 10)),
        // Order items for COGS calculation
        db
          .from("order_items")
          .select("quantity, cost_price, line_total, orders!inner(status, created_at)")
          .in("orders.status", ["paid", "processing", "shipped", "delivered"])
          .gte("orders.created_at", startDate)
          .lte("orders.created_at", endDate),
        // Monthly trend (12 months)
        db
          .from("orders")
          .select("total, created_at")
          .in("status", ["paid", "processing", "shipped", "delivered"])
          .gte("created_at", new Date(y, m - 11, 1).toISOString())
          .lte("created_at", endDate),
      ]);

    const orders = ordersResult.data ?? [];
    const refunds = refundsResult.data ?? [];
    const expenses = expensesResult.data ?? [];
    const items = itemsResult.data ?? [];
    const monthly = monthlyResult.data ?? [];

    // Truthful failure: if any leg failed (e.g. schema drift), do not render
    // zeros as real data. Surface the error to the Admin UI.
    const analyticsErrors = [
      ordersResult.error,
      refundsResult.error,
      expensesResult.error,
      itemsResult.error,
      monthlyResult.error,
    ].filter(Boolean);
    if (analyticsErrors.length > 0) {
      // Supabase/PostgREST errors are plain objects with a `message` field, not
      // Error instances — interpolating them directly produced the useless
      // "Analytics query failed: [object Object]" the live audit captured.
      const analyticsErrorText = (e: unknown): string => {
        if (e instanceof Error) return e.message;
        if (e && typeof e === "object" && "message" in e) {
          const m = (e as { message?: unknown }).message;
          if (typeof m === "string" && m.trim()) return m.trim();
        }
        if (typeof e === "string" && e.trim()) return e.trim();
        try {
          return JSON.stringify(e)?.slice(0, 200) ?? "Unknown analytics error";
        } catch {
          return "Unknown analytics error";
        }
      };
      const firstMessage = analyticsErrorText(analyticsErrors[0]);
      console.error("[adminGetSalesAnalytics] query failure:", firstMessage);
      return { data: null, error: `Analytics query failed: ${firstMessage}` };
    }

    // Gross Sales = sum of paid order totals
    const grossSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    // Refunds = sum of refunded transaction amounts
    const refundTotal = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // Net Sales = Gross Sales - Refunds
    const netSales = grossSales - refundTotal;

    // COGS = sum of (quantity × cost_price); NULL cost = unknown (excluded),
    // explicit 0 = known-zero. Summarizer also reports costDataAvailable so the
    // UI can show "not configured" instead of fabricating ₦0/100% margin.
    const cogsSummary = summarizeCogs(items);
    const cogsTotal = cogsSummary.cogsTotal;
    const itemsWithCost = cogsSummary.itemsWithCost;
    const itemsWithoutCost = cogsSummary.itemsWithoutCost;

    // Gross Profit = Net Sales - COGS
    const grossProfit = netSales - cogsTotal;
    const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    // Operating Expenses
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount || 0);
    }

    // Net Profit = Gross Profit - Operating Expenses
    const netProfit = grossProfit - totalExpenses;

    // Units sold
    const unitsSold = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

    // Average Order Value
    const avgOrderValue = orders.length > 0 ? grossSales / orders.length : 0;

    // Monthly trend
    const monthlyTrend: { month: string; sales: number; orders: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      const key = d.toISOString().slice(0, 7);
      const monthOrders = monthly.filter((o) => o.created_at?.startsWith(key));
      monthlyTrend.push({
        month: key,
        sales: monthOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: monthOrders.length,
      });
    }

    return {
      data: {
        period: data.period,
        startDate,
        endDate,
        grossSales,
        netSales,
        paidOrders: orders.length,
        unitsSold,
        avgOrderValue,
        discounts: 0, // TODO: calculate from coupon usage if needed
        refunds: refundTotal,
        cogs: cogsTotal,
        grossProfit,
        grossMargin,
        totalExpenses,
        expenseByCategory,
        netProfit,
        monthlyTrend,
        cogsDataQuality: {
          itemsWithCost,
          itemsWithoutCost,
          hasCompleteData: cogsSummary.hasCompleteData,
          costDataAvailable: cogsSummary.costDataAvailable,
        },
      },
    };
  });

// ══════════════════════════════════════════════════════════════
// DASHBOARD FINANCIAL SUMMARY
// ══════════════════════════════════════════════════════════════
// Computes all business summary cards server-side in parallel.
// Returns period-over-period comparisons for the dashboard.
// Never fabricates profit — marks data quality explicitly.

interface PeriodMetrics {
  sales: number;
  orders: number;
  units: number;
  cogs: number;
  refunds: number;
  expenses: number;
  cogsComplete: boolean;
}

function makeZeroMetrics(): PeriodMetrics {
  return { sales: 0, orders: 0, units: 0, cogs: 0, refunds: 0, expenses: 0, cogsComplete: true };
}

export const adminGetDashboardFinancialSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { createDatabaseClient, requirePermission } = await import("./admin-ops.server");
    const authError = await requirePermission("analytics.view");
    if (authError) return { summary: null, error: authError };
    const db = createDatabaseClient();

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const dayOfWeek = now.getDay(); // 0=Sun

    // ── Date ranges ──────────────────────────────────────
    // This week: Monday → now
    const thisWeekStart = new Date(y, m, d - ((dayOfWeek + 6) % 7));
    thisWeekStart.setHours(0, 0, 0, 0);
    const prevWeekEnd = new Date(thisWeekStart.getTime() - 1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekStart.getDate() - 6);
    prevWeekStart.setHours(0, 0, 0, 0);

    // This month: 1st → now
    const thisMonthStart = new Date(y, m, 1);
    const prevMonthStart = new Date(y, m - 1, 1);
    const prevMonthEnd = new Date(y, m, 0, 23, 59, 59);

    // YTD: Jan 1 → now
    const ytdStart = new Date(y, 0, 1);
    // Previous year same period: Jan 1 → same day-of-year
    const prevYearEnd = new Date(y - 1, m, Math.min(d, 28), 23, 59, 59);
    const prevYearStart = new Date(y - 1, 0, 1);

    const endDate = now.toISOString();

    // ── Helper: compute period metrics from raw rows ──────
    function computePeriod(
      orders: any[],
      items: any[],
      refunds: any[],
      expenses: any[],
    ): PeriodMetrics {
      const sales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
      const refundAmount = refunds.reduce((s, r) => s + Number(r.amount || 0), 0);
      let cogs = 0;
      let unitsWithCost = 0;
      let unitsWithoutCost = 0;
      for (const item of items) {
        const cost = Number(item.cost_price || 0);
        const qty = Number(item.quantity || 0);
        if (cost > 0) cogs += cost * qty;
        if (cost > 0) unitsWithCost += qty;
        else unitsWithoutCost += qty;
      }
      const expTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const units = unitsWithCost + unitsWithoutCost;
      return {
        sales,
        orders: orders.length,
        units,
        cogs,
        refunds: refundAmount,
        expenses: expTotal,
        cogsComplete: unitsWithoutCost === 0,
      };
    }

    // ── Helper: query a period ────────────────────────────
    async function queryPeriod(start: string, end: string): Promise<PeriodMetrics> {
      const [ordersRes, itemsRes, refundsRes, expensesRes] = await Promise.all([
        db
          .from("orders")
          .select("id, total")
          .in("status", ["paid", "processing", "shipped", "delivered"])
          .gte("created_at", start)
          .lte("created_at", end),
        db
          .from("order_items")
          .select("quantity, cost_price")
          .in("orders.status", ["paid", "processing", "shipped", "delivered"])
          .gte("orders.created_at", start)
          .lte("orders.created_at", end),
        db
          .from("payment_transactions")
          .select("amount")
          .eq("status", "refunded")
          .gte("created_at", start)
          .lte("created_at", end),
        db
          .from("expenses")
          .select("amount")
          .gte("date", start.slice(0, 10))
          .lte("date", end.slice(0, 10)),
      ]);
      return computePeriod(
        ordersRes.data ?? [],
        itemsRes.data ?? [],
        refundsRes.data ?? [],
        expensesRes.data ?? [],
      );
    }

    // ── Run all 6 periods in parallel ─────────────────────
    const [thisWeek, prevWeek, thisMonth, prevMonth, ytd, prevYear] = await Promise.all([
      queryPeriod(thisWeekStart.toISOString(), endDate),
      queryPeriod(prevWeekStart.toISOString(), prevWeekEnd.toISOString()),
      queryPeriod(thisMonthStart.toISOString(), endDate),
      queryPeriod(prevMonthStart.toISOString(), prevMonthEnd.toISOString()),
      queryPeriod(ytdStart.toISOString(), endDate),
      queryPeriod(prevYearStart.toISOString(), prevYearEnd.toISOString()),
    ]);

    // ── Derived metrics per period ────────────────────────
    function derived(p: PeriodMetrics) {
      const netSales = p.sales - p.refunds;
      const grossProfit = p.cogsComplete ? netSales - p.cogs : null;
      const grossMargin =
        netSales > 0 && grossProfit !== null ? (grossProfit / netSales) * 100 : null;
      const netProfit = grossProfit !== null ? grossProfit - p.expenses : null;
      const aov = p.orders > 0 ? p.sales / p.orders : 0;
      return {
        ...p,
        netSales,
        grossProfit,
        grossMargin,
        netProfit,
        aov,
        cogsDataComplete: p.cogsComplete,
      };
    }

    // ── Comparison helper ─────────────────────────────────
    function pctChange(current: number, previous: number): number | null {
      if (previous === 0) return current > 0 ? 100 : null;
      return ((current - previous) / Math.abs(previous)) * 100;
    }

    const tw = derived(thisWeek);
    const pw = derived(prevWeek);
    const tm = derived(thisMonth);
    const pm = derived(prevMonth);
    const yt = derived(ytd);
    const py = derived(prevYear);

    return {
      summary: {
        thisWeek: { ...tw, vsPrev: pctChange(tw.sales, pw.sales) },
        prevWeek: pw,
        thisMonth: { ...tm, vsPrev: pctChange(tm.sales, pm.sales) },
        prevMonth: pm,
        yearToDate: { ...yt, vsPrev: pctChange(yt.sales, py.sales) },
        prevYear: py,
      },
    };
  },
);
