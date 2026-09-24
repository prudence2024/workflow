/**
 * Notification helpers for creating operational notifications.
 *
 * These functions are designed to be called from server-side code
 * (server functions, webhooks, callbacks, cron jobs).
 *
 * They NEVER throw — notification failures must never break business operations.
 */

type NotificationInput = {
  eventKey: string;
  category: string;
  severity?: "info" | "warning" | "error" | "critical";
  title: string;
  message?: string;
  targetUrl?: string;
  permissionKey?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Create a notification via the database directly.
 * Safe to call from any server context — never throws.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    // Dynamic import to avoid bundling issues
    const { createNotification } = await import("@/lib/admin/server-fns");
    await createNotification(input);
  } catch (err) {
    // Notification failure must never break the calling operation
    console.error("[Notify] Failed:", err instanceof Error ? err.message : err);
  }
}

// ── Convenience constructors ──────────────────────────────────

export const notifications = {
  // PAYMENT / ORDERS — deep-link to the exact order record (?detail= is the
  // canonical Orders detail param; RBAC is enforced at the destination).
  paymentSuccess(orderId: string, amount: number, email?: string) {
    return notify({
      eventKey: `order_paid_${orderId}`,
      category: "payment",
      severity: "info",
      title: "New payment received",
      message: `Order ${orderId.slice(0, 8)} — ₦${(amount / 100).toLocaleString()}${email ? ` from ${email}` : ""}`,
      targetUrl: `/dashboard/orders?detail=${orderId}`,
      permissionKey: "orders.view",
    });
  },

  paymentFailed(orderId: string, reason?: string) {
    return notify({
      eventKey: `payment_failed_${orderId}`,
      category: "payment",
      severity: "warning",
      title: "Payment failed",
      message: `Payment for order ${orderId.slice(0, 8)} failed${reason ? `: ${reason}` : ""}`,
      targetUrl: `/dashboard/orders?detail=${orderId}`,
      permissionKey: "orders.view",
    });
  },

  paymentVerificationFailed(reference: string, reason?: string) {
    return notify({
      eventKey: `paystack_verify_failed_${reference}`,
      category: "payment",
      severity: "error",
      title: "Payment verification failed",
      message: `Could not verify Paystack reference ${reference}${reason ? `: ${reason}` : ""}`,
      targetUrl: "/dashboard/payments",
      permissionKey: "payments.view",
    });
  },

  orderAbandoned(orderId: string) {
    return notify({
      eventKey: `order_abandoned_${orderId}`,
      category: "payment",
      severity: "info",
      title: "Order abandoned",
      message: `Order ${orderId.slice(0, 8)} has been marked as abandoned after 24h`,
      targetUrl: `/dashboard/orders?detail=${orderId}`,
      permissionKey: "orders.view",
    });
  },

  latePaymentReconciliation(orderId: string) {
    return notify({
      eventKey: `late_payment_reconcile_${orderId}`,
      category: "payment",
      severity: "warning",
      title: "Late payment — review needed",
      message: `Payment received for order ${orderId.slice(0, 8)} after initial timeout. Review fulfilment.`,
      targetUrl: `/dashboard/orders?detail=${orderId}`,
      permissionKey: "orders.update",
    });
  },

  // RECEIPTS
  receiptGenerated(orderId: string) {
    return notify({
      eventKey: `receipt_generated_${orderId}`,
      category: "receipt",
      severity: "info",
      title: "Receipt generated",
      message: `Receipt created for order ${orderId.slice(0, 8)}`,
      targetUrl: "/dashboard/receipts",
      permissionKey: "receipts.view",
    });
  },

  receiptFailed(orderId: string, reason?: string) {
    return notify({
      eventKey: `receipt_failed_${orderId}`,
      category: "receipt",
      severity: "error",
      title: "Receipt generation failed",
      message: `Failed to generate receipt for order ${orderId.slice(0, 8)}${reason ? `: ${reason}` : ""}`,
      targetUrl: "/dashboard/receipts",
      permissionKey: "receipts.view",
    });
  },

  // INVENTORY
  lowStock(productId: string, productName: string, quantity: number) {
    return notify({
      eventKey: `low_stock_${productId}`,
      category: "inventory",
      severity: "warning",
      title: "Low stock alert",
      message: `${productName} — only ${quantity} units remaining`,
      targetUrl: `/dashboard/products?detail=${productId}`,
      permissionKey: "inventory.view",
    });
  },

  outOfStock(
    productId: string,
    productName: string,
    source: "sale" | "admin_adjustment" = "admin_adjustment",
    orderReference?: string,
  ) {
    return notify({
      eventKey: `out_of_stock_${productId}`,
      category: "inventory",
      severity: "error",
      title: "Product sold out",
      message:
        source === "sale"
          ? `${productName} has reached zero available stock${orderReference ? ` (order ${orderReference})` : " — last unit(s) purchased"}`
          : `${productName} stock was set to zero by a manual adjustment`,
      targetUrl: `/dashboard/products?detail=${productId}`,
      permissionKey: "inventory.view",
    });
  },

  // CUSTOMERS / CONTACT
  newContactMessage(name: string, subject?: string) {
    return notify({
      eventKey: `contact_new_${Date.now()}`,
      category: "contact",
      severity: "info",
      title: "New contact message",
      message: `From ${name}${subject ? `: ${subject}` : ""}`,
      targetUrl: "/dashboard/messages",
      permissionKey: "messages.view",
    });
  },

  // REVIEWS / TESTIMONIALS
  newPendingReview(productName: string, reviewId?: string) {
    return notify({
      eventKey: reviewId ? `review_${reviewId}` : `review_pending_${Date.now()}`,
      category: "reviews",
      severity: "info",
      title: "New customer review",
      message: `A new review was submitted for ${productName}`,
      targetUrl: reviewId ? `/dashboard/reviews?detail=${reviewId}` : "/dashboard/reviews",
      permissionKey: "reviews.manage",
    });
  },

  newPendingTestimonial(name: string) {
    return notify({
      eventKey: `testimonial_pending_${Date.now()}`,
      category: "testimonials",
      severity: "info",
      title: "New pending testimonial",
      message: `From ${name} — awaiting moderation`,
      targetUrl: "/dashboard/testimonials",
      permissionKey: "testimonials.manage",
    });
  },

  // ADMIN / SECURITY
  staffInvited(email: string) {
    return notify({
      eventKey: `staff_invited_${email}`,
      category: "security",
      severity: "info",
      title: "Staff invited",
      message: `Invitation sent to ${email}`,
      targetUrl: "/dashboard/members",
      permissionKey: "staff.manage",
    });
  },

  staffDeactivated(email: string) {
    return notify({
      eventKey: `staff_deactivated_${email}`,
      category: "security",
      severity: "warning",
      title: "Staff deactivated",
      message: `${email} has been deactivated`,
      targetUrl: "/dashboard/members",
      permissionKey: "staff.manage",
    });
  },

  staffAccessRemoved(email: string) {
    return notify({
      eventKey: `staff_removed_${email}`,
      category: "security",
      severity: "warning",
      title: "Staff access removed",
      message: `Access removed for ${email}. Re-invite required for future access.`,
      targetUrl: "/dashboard/members",
      permissionKey: "staff.manage",
    });
  },

  rolePermissionsChanged(roleName: string) {
    return notify({
      eventKey: `role_perms_changed_${roleName}`,
      category: "security",
      severity: "info",
      title: "Role permissions updated",
      message: `Permissions for "${roleName}" role have been modified`,
      targetUrl: "/dashboard/roles",
      permissionKey: "roles.manage",
    });
  },

  // EMAIL
  resendFailure(context: string, reason?: string) {
    return notify({
      eventKey: `resend_failure_${context}`,
      category: "email",
      severity: "error",
      title: "Resend email failure",
      message: `Transactional email failed (${context})${reason ? `: ${reason}` : ""}`,
      targetUrl: "/dashboard/integrations",
      permissionKey: "integrations.view",
    });
  },

  brevoFailure(context: string, reason?: string) {
    return notify({
      eventKey: `brevo_failure_${context}`,
      category: "email",
      severity: "error",
      title: "Brevo email failure",
      message: `Marketing email failed (${context})${reason ? `: ${reason}` : ""}`,
      targetUrl: "/dashboard/integrations",
      permissionKey: "integrations.view",
    });
  },

  // MEDIA
  cloudinaryUploadFailure(context: string, reason?: string) {
    return notify({
      eventKey: `cloudinary_failure_${context}`,
      category: "media",
      severity: "error",
      title: "Image upload failed",
      message: `Cloudinary upload failed (${context})${reason ? `: ${reason}` : ""}`,
      targetUrl: "/dashboard/media",
      permissionKey: "settings.manage",
    });
  },

  // BACKUP
  backupExportSuccess(rowCount: number) {
    return notify({
      eventKey: `backup_export_${Date.now()}`,
      category: "backup",
      severity: "info",
      title: "Data export completed",
      message: `Successfully exported ${rowCount.toLocaleString()} rows`,
      targetUrl: "/dashboard/backup",
      permissionKey: "backup.create",
    });
  },

  backupExportFailed(reason?: string) {
    return notify({
      eventKey: `backup_export_failed_${Date.now()}`,
      category: "backup",
      severity: "error",
      title: "Data export failed",
      message: reason || "Export encountered an error",
      targetUrl: "/dashboard/backup",
      permissionKey: "backup.create",
    });
  },

  // OPERATIONS
  cronFailure(jobName: string, reason?: string) {
    return notify({
      eventKey: `cron_failure_${jobName}`,
      category: "operations",
      severity: "error",
      title: `Cron job failed: ${jobName}`,
      message: reason || "Check server logs for details",
      targetUrl: "/dashboard/integrations",
      permissionKey: "settings.manage",
    });
  },

  integrationFailure(provider: string, reason?: string) {
    return notify({
      eventKey: `integration_failure_${provider}`,
      category: "operations",
      severity: "error",
      title: `${provider} integration failure`,
      message: reason || "Service is not responding correctly",
      targetUrl: "/dashboard/integrations",
      permissionKey: "integrations.view",
    });
  },
};
