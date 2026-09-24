import { createDatabaseClient } from "@/lib/database.server";

export async function handleLeads(args: string): Promise<string> {
  const isToday = args.toLowerCase().includes("today");
  const limit = 5;

  try {
    const db = createDatabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Newsletter subscribers
    let subQuery = db
      .from("newsletter_subscribers")
      .select("email, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Contact submissions
    let contactQuery = db
      .from("messages")
      .select("name, email, subject, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (isToday) {
      subQuery = subQuery.gte("created_at", today.toISOString());
      contactQuery = contactQuery.gte("created_at", today.toISOString());
    }

    const [subsResult, contactsResult] = await Promise.all([subQuery, contactQuery]);

    const subs = subsResult.data || [];
    const contacts = contactsResult.data || [];

    if (subs.length === 0 && contacts.length === 0) {
      return isToday
        ? "\uD83D\uDE80 *TODAY'S ACTIVITY*\n\nNo new contacts or subscribers today."
        : "\uD83D\uDE80 *RECENT ACTIVITY*\n\nNo recent contacts or subscribers.";
    }

    const lines = [
      isToday ? "\uD83D\uDE80 *TODAY'S ACTIVITY*" : "\uD83D\uDE80 *RECENT ACTIVITY*",
      "",
    ];

    if (contacts.length > 0) {
      lines.push("*CONTACT SUBMISSIONS*");
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i] as any;
        const date = new Date(c.created_at).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "short",
        });
        lines.push(
          `${i + 1}. ${c.name || "Anonymous"} \u2014 ${c.subject || "No subject"} (${date})`,
        );
      }
    }

    if (subs.length > 0) {
      lines.push("", "*NEWSLETTER SUBSCRIBERS*");
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i] as any;
        const date = new Date(s.created_at).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "short",
        });
        lines.push(`${i + 1}. ${s.email} (${date})`);
      }
    }

    return lines.join("\n");
  } catch (err) {
    return "\u274C Failed to retrieve activity.";
  }
}
