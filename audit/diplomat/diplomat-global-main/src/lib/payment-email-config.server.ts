import "@tanstack/react-start/server-only";
import type { createDatabaseClient } from "./database.server";
import { loadBusinessSettings } from "./business-settings.server";
import { getSiteOrigin } from "./site-origin.server";
import { z } from "zod";

export type PaymentEmailConfig = {
  businessName: string;
  supportEmail: string;
  websiteUrl: string;
  dashboardUrl: string;
  receiptUrl: string;
};

function safeWebUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    return url;
  } catch {
    return;
  }
}

export async function loadPaymentEmailConfig(
  db: ReturnType<typeof createDatabaseClient>,
  receiptToken?: string,
): Promise<PaymentEmailConfig> {
  const settings = await loadBusinessSettings(db);
  const businessName = settings.company_name?.trim();
  if (!businessName) throw new Error("Business name is not configured");
  // Deployment configuration only; never a request Host/Origin or browser input.
  const origin = safeWebUrl(getSiteOrigin());
  if (!origin) throw new Error("Application origin is not configured");
  const email = z.string().email().safeParse(settings.support_email?.trim());
  return {
    businessName,
    supportEmail: email.success ? email.data : "",
    websiteUrl: safeWebUrl(settings.website_url?.trim() || "")?.href || "",
    dashboardUrl: new URL("/dashboard/orders", origin.origin).href,
    receiptUrl: receiptToken
      ? new URL(`/api/receipt/${encodeURIComponent(receiptToken)}`, origin.origin).href
      : "",
  };
}
