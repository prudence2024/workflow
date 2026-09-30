import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Founder operations bot.
 *
 * Security posture:
 *   - fail closed: with no allowlisted chat id the bot answers nobody;
 *   - the allowlist is server-side only (TELEGRAM_ALLOWED_CHAT_IDS) and is
 *     never derived from message content;
 *   - every accepted command is written to the audit trail with its chat id;
 *   - commands are read-only summaries. Nothing here can mutate customer data,
 *     so a stolen bot token cannot be used to change a workspace.
 */

export function allowedChatIds(): string[] {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

export function isAllowedChat(chatId: string | number | undefined | null): boolean {
  if (chatId === undefined || chatId === null) return false;
  const allowed = allowedChatIds();
  if (allowed.length === 0) return false; // fail closed
  return allowed.includes(String(chatId));
}

const HELP = [
  "*Workflow operations bot*",
  "/status — workspaces, members, contacts, campaigns",
  "/health — database, worker and configuration checks",
  "/usage — metered usage this month",
  "/failed — sends and submissions needing a human",
  "/outbox — queue depth by state",
  "/help — this message",
].join("\n");

export type BotReply = { text: string; ok: boolean };

export async function handleTelegramCommand(
  chatId: string,
  rawText: string,
): Promise<BotReply> {
  if (!isAllowedChat(chatId)) {
    // No detail for unauthorised chats: do not confirm the bot exists.
    return { text: "Not authorised.", ok: false };
  }

  const command = rawText.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
  let text: string;
  let action: string;

  switch (command) {
    case "/start":
    case "/help":
      text = HELP;
      action = "telegram_help";
      break;
    case "/status":
      text = await statusReport();
      action = "telegram_status";
      break;
    case "/outbox":
      text = await outboxReport();
      action = "telegram_outbox";
      break;
    case "/health":
      text = await healthReport();
      action = "telegram_health";
      break;
    case "/usage":
      text = await usageReport();
      action = "telegram_usage";
      break;
    case "/failed":
      text = await failedReport();
      action = "telegram_failed";
      break;
    default:
      text = `Unknown command: ${command || "(empty)"}\n\n${HELP}`;
      action = "telegram_unknown_command";
      break;
  }

  await auditBotAction(action, chatId, { command });

  return { text, ok: true };
}

async function statusReport(): Promise<string> {
  try {
    const rows = await db.execute<{
      organization_name: string;
      plan_key: string;
      member_count: string;
      contact_count: string;
      campaign_count: string;
    }>(sql`select * from app.platform_admin_overview()`);

    if (rows.rows.length === 0) return "*Status*\n\nNo workspaces yet.";

    const totals = rows.rows.reduce(
      (acc, r) => ({
        members: acc.members + Number(r.member_count),
        contacts: acc.contacts + Number(r.contact_count),
        campaigns: acc.campaigns + Number(r.campaign_count),
      }),
      { members: 0, contacts: 0, campaigns: 0 },
    );

    const lines = [
      "*Status*",
      `Workspaces: ${rows.rows.length}`,
      `Members: ${totals.members}`,
      `Contacts: ${totals.contacts}`,
      `Campaigns: ${totals.campaigns}`,
      "",
      "*Recent workspaces*",
      ...rows.rows
        .slice(0, 5)
        .map((r) => `• ${r.organization_name} (${r.plan_key}) — ${r.contact_count} contacts`),
    ];
    return lines.join("\n");
  } catch (err) {
    return `*Status*\n\nUnavailable: ${err instanceof Error ? err.message : "query failed"}`;
  }
}

async function outboxReport(): Promise<string> {
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role workflow_worker`);
      const res = await tx.execute<{ status: string; n: string }>(sql`
        select status, count(*)::text as n from public.outbox_events group by status order by status
      `);
      return res.rows;
    });

    if (rows.length === 0) return "*Outbox*\n\nQueue is empty.";

    const attention = rows
      .filter((r) => r.status === "ambiguous" || r.status === "exhausted")
      .reduce((sum, r) => sum + Number(r.n), 0);

    return [
      "*Outbox*",
      ...rows.map((r) => `• ${r.status}: ${r.n}`),
      "",
      attention > 0
        ? `${attention} item(s) need human review (ambiguous/exhausted).`
        : "Nothing needs review.",
    ].join("\n");
  } catch (err) {
    return `*Outbox*\n\nUnavailable: ${err instanceof Error ? err.message : "query failed"}`;
  }
}

async function healthReport(): Promise<string> {
  const checks: string[] = [];
  try {
    const res = await db.execute<{ ok: number }>(sql`select 1 as ok`);
    checks.push(res.rows[0]?.ok === 1 ? "Database: reachable" : "Database: unexpected result");
  } catch {
    checks.push("Database: UNREACHABLE");
  }
  checks.push(`Clerk: ${process.env.CLERK_SECRET_KEY ? "configured" : "NOT configured"}`);
  checks.push(`Email (Resend): ${process.env.RESEND_API_KEY ? "configured" : "not configured"}`);
  checks.push(`SMS (Termii): ${process.env.TERMII_API_KEY ? "configured" : "not configured"}`);
  checks.push(`Storage (R2): ${isR2Configured() ? "configured" : "not configured"}`);
  checks.push(`Worker secret: ${process.env.WORKER_SECRET ? "configured" : "NOT configured"}`);
  checks.push(
    `Platform admin bootstrap: ${process.env.PLATFORM_ADMIN_CLERK_USER_ID ? "configured" : "NOT configured"}`,
  );
  return ["*Health*", ...checks.map((c) => `• ${c}`)].join("\n");
}

async function usageReport(): Promise<string> {
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role workflow_worker`);
      const res = await tx.execute<{ metric: string; total: string }>(sql`
        select metric, sum(count)::text as total
          from public.usage_counters
         where period_start = date_trunc('month', now())::date
         group by metric
         order by metric
      `);
      return res.rows;
    });

    if (rows.length === 0) return "*Usage*\n\nNo metered usage recorded this month.";

    return [
      "*Usage — this month*",
      ...rows.map((r) => `• ${r.metric}: ${r.total}`),
      "",
      "Counters are incremented by the application as work completes; they are not a billing statement.",
    ].join("\n");
  } catch (err) {
    return `*Usage*\n\nUnavailable: ${err instanceof Error ? err.message : "query failed"}`;
  }
}

async function failedReport(): Promise<string> {
  try {
    const [outbox, submissions, messages] = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role workflow_worker`);
      const o = await tx.execute<{ status: string; n: string }>(sql`
        select status, count(*)::text as n from public.outbox_events
         where status in ('failed', 'exhausted', 'ambiguous')
         group by status order by status
      `);
      const s = await tx.execute<{ status: string; n: string }>(sql`
        select status, count(*)::text as n from public.campaign_records
         where status in ('failed', 'human_action_required', 'pending_review', 'review')
         group by status order by status
      `);
      const m = await tx.execute<{ status: string; n: string }>(sql`
        select status, count(*)::text as n from public.messages
         where status in ('failed', 'bounced', 'unknown')
         group by status order by status
      `);
      return [o.rows, s.rows, m.rows];
    });

    const nothing =
      outbox.length === 0 && submissions.length === 0 && messages.length === 0;
    if (nothing) return "*Needs attention*\n\nNothing is waiting on a human.";

    const section = (title: string, rows: { status: string; n: string }[]) =>
      rows.length === 0 ? [`${title}: none`] : [title, ...rows.map((r) => `• ${r.status}: ${r.n}`)];

    return [
      "*Needs attention*",
      "",
      ...section("Delivery queue", outbox),
      "",
      ...section("Form submissions", submissions),
      "",
      ...section("Messages", messages),
      "",
      "Ambiguous queue items are never retried automatically — open the Communications Centre to decide.",
    ].join("\n");
  } catch (err) {
    return `*Needs attention*\n\nUnavailable: ${err instanceof Error ? err.message : "query failed"}`;
  }
}

function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

async function auditBotAction(
  action: string,
  chatId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.execute(sql`
      insert into public.audit_logs (user_id, action, entity_type, metadata)
      values (
        null,
        ${action},
        'telegram_bot',
        ${JSON.stringify({ chat_id: chatId, ...metadata })}::jsonb
      )
    `);
  } catch {
    // Audit failures must not break the reply, but they are never silent in
    // production because Sentry captures the thrown error upstream.
  }
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  return res.ok;
}
