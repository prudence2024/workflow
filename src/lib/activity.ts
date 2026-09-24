import { db } from "@/db";
import { activityEvents } from "@/db/schema";

export async function logActivity(params: {
  orgId: string;
  contactId?: string;
  campaignId?: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(activityEvents).values({
    orgId: params.orgId,
    contactId: params.contactId,
    campaignId: params.campaignId,
    type: params.type,
    message: params.message,
    metadata: params.metadata ?? {},
  });
}
