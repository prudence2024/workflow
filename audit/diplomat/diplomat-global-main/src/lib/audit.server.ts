import "@tanstack/react-start/server-only";
import { createDatabaseClient, getDatabaseConfig } from "./database.server";

type AuditEvent = {
  actorClerkUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function writeAuditEvent(event: AuditEvent) {
  if (!getDatabaseConfig()) return { recorded: false as const, reason: "unconfigured" as const };
  const database = createDatabaseClient();
  const { error } = await database.from("audit_logs").insert({
    actor_clerk_user_id: event.actorClerkUserId,
    action: event.action.slice(0, 100),
    entity_type: event.entityType.slice(0, 100),
    entity_id: event.entityId || null,
    metadata: event.metadata || {},
  });
  if (error) {
    console.error("Audit event insert failed", { code: error.code });
    return { recorded: false as const, reason: "database_error" as const };
  }
  return { recorded: true as const };
}
