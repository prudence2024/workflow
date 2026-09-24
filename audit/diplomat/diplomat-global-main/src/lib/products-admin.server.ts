import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { auth } from "@clerk/tanstack-react-start/server";
import { createDatabaseClient, getDatabaseConfig } from "./database.server";
import {
  buildCloudinaryUploadParameters,
  CLOUDINARY_ALLOWED_FORMATS_PARAM,
  IMAGE_UPLOAD_MAX_BYTES,
  validateCloudinaryAssetMetadata,
} from "./cloudinary-upload-policy";
import { resolveLowStockThreshold } from "./inventory-lifecycle";
import { loadInventorySettings, emitLowStockTransition } from "./inventory-settings.server";

/**
 * Product creation/audit attribution. Resolves the acting admin's identity from
 * the Clerk session + admin_users. Returns "Not recorded" fields when identity
 * is unavailable so legacy/unknown provenance is honest instead of fabricated.
 */
async function resolveAdminAttribution(db: ReturnType<typeof createDatabaseClient>) {
  const session = await auth();
  if (!session.userId) throw new Error("Authenticated actor unavailable");
  const { data: admin, error } = await db
    .from("admin_users")
    .select("id, active, role_id")
    .eq("clerk_user_id", session.userId)
    .maybeSingle();
  if (error || !admin?.active || !admin.role_id) throw new Error("Authorized actor unavailable");
  const { data: role, error: roleError } = await db
    .from("roles")
    .select("key")
    .eq("id", admin.role_id)
    .maybeSingle();
  if (roleError || !role?.key) throw new Error("Authorized role unavailable");
  const { createClerkClient } = await import("@clerk/backend");
  const user = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.getUser(
    session.userId,
  );
  return {
    userId: session.userId,
    adminId: admin.id,
    adminName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Name not provided",
    adminRole: role.key,
  };
}

/** Best-effort destruction of product-owned Cloudinary assets after DB deletion. */
async function destroyProductAssets(
  publicIds: string[],
): Promise<{ destroyed: string[]; failed: string[] }> {
  const destroyed: string[] = [];
  const failed: string[] = [];
  if (publicIds.length === 0) return { destroyed, failed };
  try {
    const { getCloudinaryConfig } = await import("./cloudinary.server");
    if (!getCloudinaryConfig()) {
      return { destroyed, failed: publicIds };
    }
    const { v2: cloudinary } = await import("cloudinary");
    const config = getCloudinaryConfig()!;
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
    const verifiedIds: string[] = [];
    for (const id of publicIds) {
      const metadata = await cloudinary.api.resource(id, { resource_type: "image" });
      const proof = validateCloudinaryAssetMetadata(metadata, "diplomat-global/products");
      if (proof.ok && proof.asset.publicId === id) verifiedIds.push(id);
      else failed.push(id);
    }
    if (!verifiedIds.length) return { destroyed, failed };
    const result = await cloudinary.api.delete_resources(verifiedIds);
    for (const id of verifiedIds) {
      if (result?.deleted?.[id] === "deleted" || result?.deleted?.[id] === "not_found")
        destroyed.push(id);
      else failed.push(id);
    }
  } catch (err) {
    console.error("[product-delete] Cloudinary cleanup failed:", err);
    return { destroyed, failed: publicIds.filter((id) => !destroyed.includes(id)) };
  }
  return { destroyed, failed };
}

/** Verify caller is authorized + has the given RBAC permission. Returns error message or null. */
async function requirePermission(
  permissionKey: string,
  opts?: { auditOnDenial?: boolean; context?: string },
): Promise<string | null> {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
    return "Clerk is not configured.";
  try {
    const session = await auth();
    if (!session.isAuthenticated || !session.userId) return "Not authenticated.";
    if (!getDatabaseConfig()) return "Database not configured.";
    const db = createDatabaseClient();
    const { data } = await db
      .from("admin_users")
      .select("role_id, active")
      .eq("clerk_user_id", session.userId)
      .maybeSingle<{ role_id: string | null; active: boolean }>();
    if (!data?.active) return "Not authorized.";
    // Owner has all permissions — resolve via role_id → roles.key
    if (data.role_id) {
      const { data: roleRow } = await db
        .from("roles")
        .select("key")
        .eq("id", data.role_id)
        .single();
      if (roleRow?.key === "owner") return null;
    }
    // No role assigned
    if (!data.role_id) return `Missing permission: ${permissionKey}`;
    // Check via role_permissions table
    const { data: perm } = await db
      .from("permissions")
      .select("id")
      .eq("key", permissionKey)
      .single();
    if (!perm) return `Unknown permission: ${permissionKey}`;
    // role_permissions has no 'id' column — select 'role_id' instead
    const { data: hasPerm } = await db
      .from("role_permissions")
      .select("role_id")
      .eq("role_id", data.role_id)
      .eq("permission_id", perm.id)
      .limit(1);
    if (hasPerm && hasPerm.length > 0) return null;
    return `Missing permission: ${permissionKey}`;
  } catch {
    return "Session verification failed.";
  }
}

// Simple audit logging helper
async function logProductAudit(
  action: string,
  entityId: string | null,
  metadata?: Record<string, any>,
) {
  try {
    let userId = "unknown";
    try {
      const { auth } = await import("@clerk/tanstack-react-start/server");
      const s = await auth();
      if (s.userId) userId = s.userId;
    } catch {
      // Auth unavailable — log as system action
    }
    const db = createDatabaseClient();
    const { error } = await db.from("audit_logs").insert({
      clerk_user_id: userId,
      action,
      entity_type: "product",
      entity_id: entityId,
      metadata: metadata || {},
    });
    if (error) throw new Error("Product audit could not be persisted");
  } catch (err) {
    // Audit logging failed — non-critical, continue
    console.error("[product-audit] Failed:", err);
    throw new Error("Product audit could not be persisted");
  }
}

const productInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  sku: z.string().max(100).optional().default(""),
  tagline: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  category_id: z.string().uuid().optional().nullable(),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).optional().nullable(),
  condition: z.enum(["new", "refurbished", "used"]).default("new"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  featured: z.boolean().default(false),
  is_new: z.boolean().default(false),
  in_stock: z.boolean().default(true),
  specifications: z
    .array(z.object({ label: z.string().max(200), value: z.string().max(2000) }))
    .max(100)
    .default([]),
  /** Authoritative available stock written to the inventory row (products own one row). */
  quantity: z.number().int().min(0).max(1_000_000).optional(),
  /** Per-product low-stock threshold; falls back to the Settings default. */
  low_stock_threshold: z.number().int().min(0).max(1_000_000).nullable().optional(),
  images: z
    .array(
      z.object({
        cloudinary_public_id: z.string().min(1).max(500),
        secure_url: z.string().url().max(2_000),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        alt_text: z.string().default(""),
        sort_order: z.number().default(0),
      }),
    )
    .default([]),
});

/**
 * List all products for admin with category info.
 */
export const adminListProducts = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        product_id: z.string().uuid().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const authError = await requirePermission("products.view");
    if (authError)
      return {
        products: [] as any[],
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
      .from("products")
      .select(
        "id, slug, sku, name, tagline, description, price, compare_at_price, status, featured, is_new, in_stock, condition, category_id, specifications, created_at, categories(name, slug), product_images(cloudinary_public_id, secure_url, width, height, alt_text, sort_order), inventory(quantity, reserved, low_stock_threshold)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data?.product_id) query = query.eq("id", data.product_id);
    if (data?.search) {
      query = query.or(
        `name.ilike.%${data.search}%,slug.ilike.%${data.search}%,sku.ilike.%${data.search}%`,
      );
    }
    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    const { data: products, count, error } = await query.range(from, to);
    if (error) throw new Error("Unable to load products. Please retry.");
    const total = count ?? 0;
    const productRows = products ?? [];
    const ids = productRows.map((p) => p.id);
    const { data: audits } = ids.length
      ? await db
          .from("audit_logs")
          .select("entity_id, metadata, created_at")
          .eq("action", "product.create")
          .in("entity_id", ids)
          .order("created_at", { ascending: true })
          .limit(ids.length * 2)
      : { data: [] };
    const creators = new Map<string, { name: string; createdAt: string }>();
    for (const audit of audits ?? []) {
      if (
        audit.metadata?.action === "PRODUCT_CREATED" &&
        audit.metadata?.status === "success" &&
        audit.metadata?.actor_user_id &&
        audit.metadata?.actor_name_source === "clerk_profile" &&
        !creators.has(audit.entity_id)
      )
        creators.set(audit.entity_id, {
          name: audit.metadata.actor_name || "Not recorded",
          createdAt: audit.created_at,
        });
    }
    return {
      products: productRows.map((p) => ({ ...p, creator: creators.get(p.id) ?? null })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

/**
 * Get a single product with images for admin editing.
 */
export const adminGetProduct = createServerFn({ method: "GET" })
  .validator(z.object({ product_id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const authError = await requirePermission("products.view");
    if (authError) return { product: null };

    const db = createDatabaseClient();
    const { data: product } = await db
      .from("products")
      .select(
        "*, categories(name, slug), product_images(*), inventory(quantity, reserved, low_stock_threshold)",
      )
      .eq("id", data.product_id)
      .single();
    return { product };
  });

/**
 * Create a new product with images.
 */
export const adminCreateProduct = createServerFn({ method: "POST" })
  .validator(productInputSchema)
  .handler(async ({ data }) => createProduct(data));

export const createProduct = createServerOnlyFn(async (input: unknown) => {
  const data = productInputSchema.parse(input);
  const authError = await requirePermission("products.create", {
    auditOnDenial: true,
    context: "create product",
  });
  if (authError) return { ok: false as const, message: authError };

  const db = createDatabaseClient();
  const { images, specifications, quantity, low_stock_threshold, ...productData } = data;
  const { defaultThreshold } = await loadInventorySettings(db);
  const verifiedImages = await verifyProductImages(images);
  if (!verifiedImages.ok) return verifiedImages;
  const attribution = await resolveAdminAttribution(db);
  // Auto-generate SKU if blank, or validate provided SKU
  const { normalizeSKU, isValidSKU, generateNextSKU, categoryToCode } =
    await import("@/lib/sku.server");
  if (!productData.sku || productData.sku.trim() === "") {
    // Auto-generate next SKU
    const catName = productData.category_id
      ? (await db.from("categories").select("name").eq("id", productData.category_id).single()).data
          ?.name || ""
      : "";
    const code = categoryToCode(catName || productData.name);
    productData.sku = await generateNextSKU(db, code);
  } else {
    // Validate user-provided SKU format
    productData.sku = normalizeSKU(productData.sku);
    if (!isValidSKU(productData.sku)) {
      return {
        ok: false as const,
        message: "Invalid SKU format. Must be DG-[CODE]-SN[NUMBER], e.g. DG-CMP-SN10",
      };
    }
  }
  const { data: product, error } = await db
    .from("products")
    .insert({ ...productData, specifications: specifications || [] })
    .select("id")
    .single();

  if (error) {
    console.error("Product create failed:", error);
    return {
      ok: false as const,
      message: error.message.includes("unique")
        ? "A product with this slug or SKU already exists."
        : "Failed to create product.",
    };
  }

  if (verifiedImages.images.length > 0) {
    const { error: imageError } = await db
      .from("product_images")
      .insert(verifiedImages.images.map((img) => ({ ...img, product_id: product.id })));
    if (imageError) {
      console.error("[product-create] Image persistence failed:", imageError.message);
      await db.from("products").delete().eq("id", product.id);
      return {
        ok: false as const,
        message: "The product image could not be saved. No product was created.",
      };
    }
  }

  // Deployed column is NOT NULL: omitted/null input snapshots the current global
  // default. Every persisted integer (including zero) is a product override.
  const effectiveThreshold = resolveLowStockThreshold(low_stock_threshold, defaultThreshold);
  const { error: invError } = await db.from("inventory").upsert(
    {
      product_id: product.id,
      quantity: quantity ?? 0,
      reserved: 0,
      low_stock_threshold: effectiveThreshold,
    },
    { onConflict: "product_id" },
  );
  if (invError) {
    console.error("[product-create] Inventory auto-create failed:", invError.message);
    // Product was created but inventory failed — report partial success
    await logProductAudit("product.create", product.id, {
      action: "PRODUCT_CREATED",
      status: "partial",
      product_name: productData.name,
      sku: productData.sku,
      actor_name: attribution.adminName,
      actor_name_source: "clerk_profile",
      actor_user_id: attribution.userId,
      actor_admin_id: attribution.adminId,
      actor_role: attribution.adminRole,
      inventory_error: invError.message,
      timestamp: new Date().toISOString(),
    });
    return {
      ok: true as const,
      product_id: product.id,
      warning: "Product created but inventory row failed. Please add manually.",
    };
  }

  await logProductAudit("product.create", product.id, {
    action: "PRODUCT_CREATED",
    status: "success",
    product_name: productData.name,
    sku: productData.sku,
    actor_name: attribution.adminName,
    actor_name_source: "clerk_profile",
    actor_user_id: attribution.userId,
    actor_admin_id: attribution.adminId,
    actor_role: attribution.adminRole,
    quantity: quantity ?? 0,
    low_stock_threshold: effectiveThreshold,
    timestamp: new Date().toISOString(),
  });
  await emitLowStockTransition(
    db,
    { id: product.id, name: productData.name },
    null,
    {
      quantity: quantity ?? 0,
      reserved: 0,
      low_stock_threshold: effectiveThreshold,
    },
    "admin_adjustment",
  );
  return { ok: true as const, product_id: product.id };
});

/**
 * Update an existing product.
 */
export const adminUpdateProduct = createServerFn({ method: "POST" })
  .validator(
    z.object({ product_id: z.string().uuid() }).merge(
      productInputSchema.partial().extend({
        product_id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        slug: z.string().min(1).max(200).optional(),
        price: z.number().min(0).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => updateProduct(data));

export const updateProduct = createServerOnlyFn(async (input: unknown) => {
  const data = productInputSchema.partial().extend({ product_id: z.string().uuid() }).parse(input);
  const authError = await requirePermission("products.edit", {
    auditOnDenial: true,
    context: "update product",
  });
  if (authError) return { ok: false as const, message: authError };

  const db = createDatabaseClient();
  const {
    product_id,
    images,
    specifications,
    quantity,
    low_stock_threshold: thresholdInput,
    ...updateData
  } = data;
  const { defaultThreshold } = await loadInventorySettings(db);
  const low_stock_threshold =
    thresholdInput === undefined
      ? undefined
      : resolveLowStockThreshold(thresholdInput, defaultThreshold);
  const verifiedImages = images ? await verifyProductImages(images) : null;
  if (verifiedImages && !verifiedImages.ok) return verifiedImages;
  const attribution = await resolveAdminAttribution(db);

  // Capture the pre-edit context so meaningful edits record before/after values.
  const { data: beforeRow } = await db
    .from("products")
    .select(
      "name, sku, slug, price, compare_at_price, status, featured, is_new, in_stock, specifications, category_id",
    )
    .eq("id", product_id)
    .maybeSingle();
  const { data: beforeInventory } = await db
    .from("inventory")
    .select("quantity, reserved, low_stock_threshold")
    .eq("product_id", product_id)
    .maybeSingle();

  if (!beforeRow || !beforeInventory)
    return {
      ok: false as const,
      message: "Product or inventory could not be verified. Reload and retry.",
    };
  if (quantity !== undefined && quantity < (beforeInventory.reserved ?? 0))
    return { ok: false as const, message: "Stock cannot be lower than reserved units." };

  const payload: Record<string, any> = { ...updateData };
  if (specifications) payload.specifications = specifications;

  const { error } = await db.from("products").update(payload).eq("id", product_id);
  if (error) {
    console.error("Product update failed:", error);
    return {
      ok: false as const,
      message: error.message.includes("unique")
        ? "A product with this slug or SKU already exists."
        : "Failed to update product.",
    };
  }

  // Authoritative stock/threshold changes live on the inventory row (single
  // ownership). quantity uses an exact-value CAS so a concurrent sale cannot
  // be silently overwritten by a stale admin edit.
  if ((quantity !== undefined || low_stock_threshold !== undefined) && beforeInventory) {
    const invPayload: { quantity?: number; low_stock_threshold?: number } = {};
    if (quantity !== undefined && quantity !== beforeInventory.quantity)
      invPayload.quantity = quantity;
    if (
      low_stock_threshold !== undefined &&
      low_stock_threshold !== beforeInventory.low_stock_threshold
    )
      invPayload.low_stock_threshold = low_stock_threshold;
    if (Object.keys(invPayload).length > 0) {
      let invQuery = db.from("inventory").update(invPayload).eq("product_id", product_id);
      if (quantity !== undefined) invQuery = invQuery.eq("quantity", beforeInventory.quantity);
      const { data: invUpdated, error: invError } = await invQuery.select("quantity").maybeSingle();
      if (invError || !invUpdated) {
        console.error("[product-update] Inventory update conflict:", invError?.message);
        return {
          ok: false as const,
          message:
            "Stock changed during your edit (a sale may have completed). Reload and re-apply the stock change.",
        };
      }
    }
  }

  // Replace images without deleting the current gallery until the replacement
  // rows have been persisted. This keeps the existing gallery intact if the
  // replacement insert fails.
  if (verifiedImages) {
    const { data: currentImages, error: currentImagesError } = await db
      .from("product_images")
      .select("id")
      .eq("product_id", product_id);
    if (currentImagesError) {
      console.error(
        "[product-update] Existing images could not be loaded:",
        currentImagesError.message,
      );
      return { ok: false as const, message: "The existing product images could not be loaded." };
    }

    let replacementIds: string[] = [];
    if (verifiedImages.images.length > 0) {
      const { data: replacements, error: imageError } = await db
        .from("product_images")
        .insert(verifiedImages.images.map((img) => ({ ...img, product_id })))
        .select("id");
      if (imageError) {
        console.error("[product-update] Image persistence failed:", imageError.message);
        return { ok: false as const, message: "The updated product images could not be saved." };
      }
      replacementIds = (replacements ?? []).map((image) => image.id);
    }

    const currentImageIds = (currentImages ?? []).map((image) => image.id);
    if (currentImageIds.length > 0) {
      const { error: oldImageDeleteError } = await db
        .from("product_images")
        .delete()
        .in("id", currentImageIds);
      if (oldImageDeleteError) {
        console.error(
          "[product-update] Existing images could not be replaced:",
          oldImageDeleteError.message,
        );
        if (replacementIds.length > 0) {
          const { error: rollbackError } = await db
            .from("product_images")
            .delete()
            .in("id", replacementIds);
          if (rollbackError) {
            console.error(
              "[product-update] Replacement-image rollback failed:",
              rollbackError.message,
            );
          }
        }
        return { ok: false as const, message: "The product images could not be replaced." };
      }
    }
  }

  await emitLowStockTransition(
    db,
    { id: product_id, name: updateData.name ?? beforeRow.name },
    beforeInventory,
    {
      ...beforeInventory,
      quantity: quantity ?? beforeInventory.quantity,
      low_stock_threshold: low_stock_threshold ?? beforeInventory.low_stock_threshold,
    },
    "admin_adjustment",
  );

  // Record the meaningful before/after diff for this edit.
  const before = beforeRow as Record<string, unknown> | null;
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of [
    "name",
    "sku",
    "slug",
    "price",
    "compare_at_price",
    "status",
    "featured",
    "is_new",
    "in_stock",
    "specifications",
    "category_id",
  ] as const) {
    if (payload[key] !== undefined) {
      const beforeValue = before?.[key];
      const afterValue = payload[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[key] = { before: beforeValue ?? null, after: afterValue };
      }
    }
  }
  if (quantity !== undefined && beforeInventory && quantity !== beforeInventory.quantity) {
    changes.quantity = { before: beforeInventory.quantity, after: quantity };
  }
  if (
    low_stock_threshold !== undefined &&
    beforeInventory &&
    low_stock_threshold !== beforeInventory.low_stock_threshold
  ) {
    changes.low_stock_threshold = {
      before: beforeInventory.low_stock_threshold,
      after: low_stock_threshold,
    };
  }
  if (Object.keys(changes).length > 0) {
    await logProductAudit("product.edit", product_id, {
      action: "PRODUCT_UPDATED",
      status: "success",
      product_name: (payload.name as string) || before?.name || "",
      sku: (payload.sku as string) || before?.sku || "",
      actor_name: attribution.adminName,
      actor_name_source: "clerk_profile",
      actor_user_id: attribution.userId,
      actor_admin_id: attribution.adminId,
      actor_role: attribution.adminRole,
      changes,
      timestamp: new Date().toISOString(),
    });
  }

  return { ok: true as const };
});

/**
 * Delete a product and its images.
 */
export const adminDeleteProduct = createServerFn({ method: "POST" })
  .validator(z.object({ product_id: z.string().uuid() }))
  .handler(async ({ data }) => deleteProduct(data));

export const deleteProduct = createServerOnlyFn(async (input: unknown) => {
  const data = z.object({ product_id: z.string().uuid() }).parse(input);
  const authError = await requirePermission("products.archive", {
    auditOnDenial: true,
    context: "delete product",
  });
  if (authError) return { ok: false as const, message: authError };

  const db = createDatabaseClient();
  // Capture the product context BEFORE deletion so the audit row can name
  // what was destroyed (the row no longer exists afterwards).
  const { data: target } = await db
    .from("products")
    .select("name, sku, slug, product_images(cloudinary_public_id, secure_url)")
    .eq("id", data.product_id)
    .maybeSingle();
  if (!target) return { ok: false as const, message: "Product not found." };
  const attribution = await resolveAdminAttribution(db);

  await logProductAudit("product.delete", data.product_id, {
    action: "PRODUCT_DELETED",
    status: "requested",
    product_name: target.name,
    sku: target.sku,
    slug: target.slug,
    actor_name: attribution.adminName,
    actor_name_source: "clerk_profile",
    actor_user_id: attribution.userId,
    actor_admin_id: attribution.adminId,
    actor_role: attribution.adminRole,
    timestamp: new Date().toISOString(),
  });

  const { error } = await db.from("products").delete().eq("id", data.product_id);
  if (error) {
    await logProductAudit("product.delete", data.product_id, {
      action: "PRODUCT_DELETED",
      status: "failed",
      product_name: target.name,
      sku: target.sku,
      actor_name: attribution.adminName,
      actor_name_source: "clerk_profile",
      actor_user_id: attribution.userId,
      actor_admin_id: attribution.adminId,
      actor_role: attribution.adminRole,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return { ok: false as const, message: "Failed to delete product." };
  }

  await logProductAudit("product.delete", data.product_id, {
    action: "PRODUCT_DELETED",
    status: "success",
    product_name: target.name,
    sku: target.sku,
    actor_name: attribution.adminName,
    actor_name_source: "clerk_profile",
    actor_user_id: attribution.userId,
    actor_admin_id: attribution.adminId,
    actor_role: attribution.adminRole,
    timestamp: new Date().toISOString(),
  });

  // Provider cleanup only after the DB delete succeeded — owned assets only.
  const { findUnsharedProductAssets } = await import("./product-media-cleanup.server");
  const plan = await findUnsharedProductAssets(
    db,
    target.product_images ?? [],
    process.env.CLOUDINARY_CLOUD_NAME ?? "",
  );
  const cleanup = await destroyProductAssets(plan.safe);
  if (plan.scanFailed) cleanup.failed.push(...plan.retained);
  if (plan.retained.length > 0 && !plan.scanFailed) {
    await logProductAudit("product.cloudinary_cleanup", data.product_id, {
      action: "PRODUCT_CLOUDINARY_CLEANUP",
      status: "retained",
      retained_public_ids: plan.retained,
      reason: "Shared or ownership not proven",
    });
  }
  if (cleanup.failed.length > 0) {
    await logProductAudit("product.cloudinary_cleanup", data.product_id, {
      action: "PRODUCT_CLOUDINARY_CLEANUP",
      status: "retryable",
      product_name: target.name,
      sku: target.sku,
      failed_public_ids: cleanup.failed,
      timestamp: new Date().toISOString(),
    });
  }
  return { ok: true as const, cleanup_failed: cleanup.failed.length > 0 };
});

/**
 * List all categories for dropdowns (read-only, no auth needed for public categories).
 */
export const adminListCategories = createServerFn({ method: "GET" }).handler(async () => {
  if (!getDatabaseConfig()) return { categories: [] as any[] };
  const db = createDatabaseClient();
  const { data: categories } = await db
    .from("categories")
    .select("id, name, slug, sort_order")
    .eq("active", true)
    .order("sort_order");
  return { categories: categories ?? [] };
});

/**
 * Get a Cloudinary signed upload for product images.
 * Returns the cloud name, API key, timestamp, folder, and signature.
 * Client uploads directly to Cloudinary using these params.
 */
const VALID_FOLDERS: Record<string, string> = {
  products: "diplomat-global/products",
  hero: "diplomat-global/hero",
  blogs: "diplomat-global/blogs",
  media: "diplomat-global/media",
  avatars: "diplomat-global/avatars",
};

/**
 * Folder → required permission mapping.
 * Each upload context requires a specific permission — not a generic read permission.
 */
const FOLDER_PERMISSIONS: Record<string, string> = {
  products: "products.create",
  hero: "hero.manage",
  blogs: "blog.manage",
  media: "content.manage",
  avatars: "settings.manage",
};

/** Client UX allowlist; provider metadata remains authoritative. */
const ALLOWED_FORMATS = ["image/jpeg", "image/png", "image/webp"];

async function getConfiguredCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  const config = { cloudName, apiKey, apiSecret };

  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  return { config, cloudinary };
}

async function verifyCloudinaryAsset(folder: keyof typeof VALID_FOLDERS, publicId: string) {
  const configured = await getConfiguredCloudinary();
  if (!configured) {
    return { ok: false as const, message: "Cloudinary is not configured." };
  }

  try {
    const metadata = await configured.cloudinary.api.resource(publicId, {
      resource_type: "image",
    });
    const validation = validateCloudinaryAssetMetadata(metadata, VALID_FOLDERS[folder]);
    if (!validation.ok) {
      if (validation.ownedByExpectedFolder) {
        await configured.cloudinary.uploader
          .destroy(publicId, { resource_type: "image", invalidate: true })
          .catch((error: unknown) =>
            console.error("[cloudinary] Invalid asset cleanup failed:", error),
          );
      }
      return { ok: false as const, message: validation.message };
    }
    return { ok: true as const, asset: validation.asset };
  } catch (error) {
    console.error("[cloudinary] Asset verification failed:", error);
    return {
      ok: false as const,
      message: "The uploaded image could not be verified with Cloudinary. Please try again.",
    };
  }
}

async function verifyProductImages(images: z.infer<typeof productInputSchema>["images"]) {
  const verified = [];
  for (const image of images) {
    const result = await verifyCloudinaryAsset("products", image.cloudinary_public_id);
    if (!result.ok) return result;
    verified.push({
      cloudinary_public_id: result.asset.publicId,
      secure_url: result.asset.secureUrl,
      width: result.asset.width,
      height: result.asset.height,
      alt_text: image.alt_text,
      sort_order: image.sort_order,
    });
  }
  return { ok: true as const, images: verified };
}

export const getCloudinaryUploadSignature = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        folder: z.enum(["products", "hero", "blogs", "media", "avatars"]).default("products"),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const folder = data?.folder || "products";
    const requiredPermission = FOLDER_PERMISSIONS[folder];
    if (!requiredPermission) return { ok: false as const, message: "Invalid upload context." };

    const authError = await requirePermission(requiredPermission);
    if (authError) return { ok: false as const, message: authError };

    // Rate limit upload signature requests (separate from general admin mutations)
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const rl = await checkRateLimit("admin-upload");
    if (rl.configured && !rl.success) {
      return {
        ok: false as const,
        message: "Too many upload requests. Please wait and try again.",
      };
    }

    const configured = await getConfiguredCloudinary();
    if (!configured) {
      return { ok: false as const, message: "Cloudinary is not configured." };
    }

    const timestamp = Math.floor(Date.now() / 1_000);
    const signedParameters = buildCloudinaryUploadParameters(timestamp, VALID_FOLDERS[folder]);
    const signature = configured.cloudinary.utils.api_sign_request(
      signedParameters,
      configured.config.apiSecret,
    );

    return {
      ok: true as const,
      cloudName: configured.config.cloudName,
      apiKey: configured.config.apiKey,
      timestamp,
      folder: VALID_FOLDERS[folder],
      signature,
      allowedFormats: ALLOWED_FORMATS,
      allowedFormatsParam: CLOUDINARY_ALLOWED_FORMATS_PARAM,
      maxFileSize: IMAGE_UPLOAD_MAX_BYTES,
    };
  });

export const verifyCloudinaryImageUpload = createServerFn({ method: "POST" })
  .validator(
    z.object({
      folder: z.enum(["products", "hero", "blogs", "media", "avatars"]),
      publicId: z.string().min(1).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const authError = await requirePermission(FOLDER_PERMISSIONS[data.folder]);
    if (authError) return { ok: false as const, message: authError };
    return verifyCloudinaryAsset(data.folder, data.publicId);
  });

/**
 * Report a Cloudinary upload failure from the client.
 * Creates an admin notification so the team is aware of upload issues.
 */
export const reportCloudinaryUploadFailure = createServerFn({ method: "POST" })
  .validator(z.object({ context: z.string(), reason: z.string().optional() }))
  .handler(async ({ data }) => {
    const authError = await requirePermission("products.create");
    if (authError) return { ok: false as const, message: authError };
    try {
      const { notifications } = await import("@/lib/notifications");
      await notifications.cloudinaryUploadFailure(data.context, data.reason);
    } catch (error) {
      console.error("[cloudinary] Upload-failure notification could not be recorded:", error);
    }
    return { ok: true as const };
  });
