import "@tanstack/react-start/server-only";
import { BrevoClient } from "@getbrevo/brevo";

export async function subscribeMarketingContact(email: string, consent: boolean) {
  if (!consent) return { subscribed: false as const, reason: "consent_required" as const };
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const listId = Number(process.env.BREVO_MARKETING_LIST_ID);
  if (!apiKey || !Number.isSafeInteger(listId) || listId <= 0) {
    return { subscribed: false as const, reason: "unconfigured" as const };
  }
  const client = new BrevoClient({ apiKey });
  try {
    await client.contacts.createContact({
      email,
      listIds: [listId],
      updateEnabled: true,
      attributes: { CONSENT_SOURCE: "sleek-shop-website" },
    });
    return { subscribed: true as const };
  } catch (error) {
    console.error("Brevo subscription failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { subscribed: false as const, reason: "provider_error" as const };
  }
}
