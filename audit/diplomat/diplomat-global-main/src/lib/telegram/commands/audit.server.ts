import { createDatabaseClient } from "@/lib/admin/admin-ops.server";

function getDb() {
  try {
    return createDatabaseClient();
  } catch {
    return null;
  }
}

/** /audit today — show today's security audit events */
export async function handleAuditToday(): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: events, error } = await db
      .from("audit_logs")
      .select("id, action, actor_email, metadata, created_at")
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return "⚠️ Failed to fetch audit logs.";

    if (!events || events.length === 0) {
      return "🛡️ *Audit — Today*\n\nNo audit events recorded today.";
    }

    const lines = [`🛡️ *Audit Events — Today*\n`];
    for (const e of events) {
      const time = new Date(e.created_at).toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      });
      // Prefer the authoritative recorded display name; fall back to the
      // raw email (never a manufactured name derived from its prefix).
      const actor = e.metadata?.display_name || e.actor_email || "system";
      const action = (e.action || "").replace(/_/g, " ");
      lines.push(`  ${time} — ${actor}: ${action}`);
    }

    if (events.length === 20) {
      lines.push(`\n_...showing latest 20 of more events_`);
    }

    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching audit logs.";
  }
}
