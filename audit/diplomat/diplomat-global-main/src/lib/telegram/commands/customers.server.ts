import { createDatabaseClient } from "@/lib/admin/admin-ops.server";

function getDb() {
  try {
    return createDatabaseClient();
  } catch {
    return null;
  }
}

/** /customers — show recent customers */
export async function handleCustomers(): Promise<string> {
  const db = getDb();
  if (!db) return "⚠️ Database not available.";

  try {
    const { data: customers, error } = await db
      .from("customers")
      .select("id, name, email, phone, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return "⚠️ Failed to fetch customers.";

    if (!customers || customers.length === 0) {
      return "👤 *Customers*\n\nNo customers found.";
    }

    const lines = [`👤 *Recent Customers*\n`];
    for (const c of customers) {
      const date = new Date(c.created_at).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
      });
      const statusIcon = c.status === "active" ? "✅" : "⚪";
      // Minimize PII — show only first name + email domain
      const firstName = (c.name || "").split(" ")[0] || "Customer";
      const emailDomain = c.email ? `@${c.email.split("@")[1]}` : "";
      lines.push(`${statusIcon} ${firstName}${emailDomain} — ${date}`);
    }
    return lines.join("\n");
  } catch {
    return "⚠️ Error fetching customers.";
  }
}
