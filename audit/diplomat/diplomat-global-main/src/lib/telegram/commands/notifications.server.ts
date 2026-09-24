import { createDatabaseClient } from "@/lib/admin/admin-ops.server";

function getDb() {
  try {
    return createDatabaseClient();
  } catch {
    return null;
  }
}

/** /notifications — show recent notifications */
export async function handleNotifications(): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  try {
    const { data: notifs, error } = await db
      .from("admin_notifications")
      .select("id, title, message, severity, category, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return "⚠️ Failed to fetch notifications.";

    if (!notifs || notifs.length === 0) {
      return "🔔 *Notifications*\n\nNo notifications.";
    }

    const unread = notifs.filter((n) => !n.is_read).length;
    const lines = [`🔔 *Notifications* (${unread} unread)\n`];

    for (const n of notifs) {
      const time = new Date(n.created_at).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      const icon =
        n.severity === "error" || n.severity === "critical"
          ? "🔴"
          : n.severity === "warning"
            ? "🟡"
            : "🔵";
      const read = n.is_read ? "" : " *NEW*";
      lines.push(`${icon} ${n.title}${read}\n   ${n.message || ""} — ${time}`);
    }

    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching notifications.";
  }
}
