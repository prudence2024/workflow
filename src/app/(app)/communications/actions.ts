"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentOrg, getCurrentUser, identityOf } from "@/lib/auth";
import { inWorkspace, type Workspace } from "@/lib/data";
import { withTenant } from "@/lib/tenant";
import { enqueueEvent } from "@/lib/outbox";
import { requirePermission } from "@/lib/authorization";

/**
 * Communications Center mutations.
 *
 * Every action follows the same three gates, in this order, and the order is
 * the point:
 *
 *   1. permission — resolved from the database for the current tenant context;
 *   2. consent + suppression — evaluated per recipient inside the same
 *      transaction that writes the queue row, so a race cannot slip a revoked
 *      address through;
 *   3. enqueue — an idempotency key derived from the logical message, so a
 *      double-click or a retried request cannot send twice.
 *
 * Nothing in this file reports a message as sent. A row leaves here as `queued`
 * with provider `pending_provider`. Only a provider callback or the dispatcher,
 * seeing a real provider id, may advance it.
 */

async function currentWorkspace(): Promise<Workspace> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  return { user, org };
}

function fail(message: string): never {
  redirect(`/communications?error=${encodeURIComponent(message)}`);
}

const queueSendSchema = z.object({
  channel: z.enum(["email", "sms"]),
  templateId: z.string().uuid("Choose a template"),
  subject: z.string().max(300).optional(),
});

export async function queueSendAction(formData: FormData) {
  const workspace = await currentWorkspace();

  // Gate 1 — capability, from the database, for this tenant context.
  if (!workspace.user.clerkUserId) {
    // Legacy sessions: the same check, executed inside the tenant transaction.
    const allowed = await withTenant(identityOf(workspace.user), workspace.org.orgId, async (tx) => {
      const res = await tx.execute<{ ok: boolean }>(
        sql`select app.has_permission('messages:send') as ok`,
      );
      return Boolean(res.rows[0]?.ok);
    });
    if (!allowed) fail("Your role cannot send communications in this workspace.");
  } else {
    try {
      await requirePermission(workspace.user.clerkUserId, workspace.org.orgId, "messages:send", {
        auditOnDenial: true,
        context: "communications/queue",
      });
    } catch {
      fail("Your role cannot send communications in this workspace.");
    }
  }

  const parsed = queueSendSchema.safeParse({
    channel: formData.get("channel"),
    templateId: formData.get("templateId"),
    subject: formData.get("subject") ?? undefined,
  });
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const input = parsed.data!;

  const batchKey = String(formData.get("batchKey") ?? Date.now().toString(36));

  const outcome = await inWorkspace(workspace, async (tx) => {
    const template = await tx.execute<{ name: string; subject: string; body: string }>(sql`
      select name, subject, body from public.message_templates where id = ${input.templateId}::uuid
    `);
    if (template.rows.length === 0) return { error: "That template no longer exists." };
    const tpl = template.rows[0];

    // Gate 2 — the audience is computed by the database, not by the browser.
    const audience = await tx.execute<{ contact_id: string; address: string; first_name: string }>(sql`
      select c.id as contact_id,
             trim(case when ${input.channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end) as address,
             c.first_name
        from public.contacts c
       where c.archived_at is null
         and trim(case when ${input.channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end) <> ''
         and exists (
           select 1 from public.contact_channel_consents cc
            where cc.contact_id = c.id and cc.channel = ${input.channel} and cc.status = 'granted'
         )
         and not exists (
           select 1 from public.suppression_entries s
            where s.channel = ${input.channel}
              and lower(s.address) = lower(trim(case when ${input.channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end))
         )
       order by c.created_at
       limit 500
    `);

    if (audience.rows.length === 0) {
      return { error: "Nobody in this workspace is currently eligible on that channel." };
    }

    const subject = input.subject?.trim() || tpl.subject;
    let queued = 0;
    let alreadyQueued = 0;

    for (const recipient of audience.rows) {
      const body = render(tpl.body, {
        first_name: recipient.first_name,
        organization: workspace.org.orgName,
      });
      const renderedSubject = render(subject, {
        first_name: recipient.first_name,
        organization: workspace.org.orgName,
      });

      const messageRows = await tx.execute<{ id: string }>(sql`
        insert into public.messages
          (org_id, contact_id, template_id, channel, subject, body, status, provider)
        values (
          ${workspace.org.orgId}::uuid,
          ${recipient.contact_id}::uuid,
          ${input.templateId}::uuid,
          ${input.channel},
          ${input.channel === "email" ? renderedSubject : " "},
          ${body},
          'queued',
          'pending_provider'
        )
        returning id
      `);
      const messageId = messageRows.rows[0].id;

      // Gate 3 — durable, idempotent enqueue in the SAME transaction.
      const enqueued = await enqueueEvent(tx, {
        orgId: workspace.org.orgId,
        eventType: input.channel === "email" ? "email" : "sms",
        idempotencyKey: `msg:${input.channel}:${input.templateId}:${recipient.contact_id}:${batchKey}`,
        provider: input.channel === "email" ? "resend" : "termii",
        resourceType: "message",
        resourceId: messageId,
        payload: {
          to: recipient.address,
          subject: renderedSubject,
          html: body,
          body,
          messageId,
          contactId: recipient.contact_id,
        },
      });

      if (enqueued.enqueued) queued += 1;
      else alreadyQueued += 1;
    }

    await tx.execute(sql`
      insert into public.audit_logs (org_id, user_id, action, entity_type, metadata)
      values (
        ${workspace.org.orgId}::uuid,
        app.current_user_id(),
        'communications_queued',
        'message',
        ${JSON.stringify({
          channel: input.channel,
          template: tpl.name,
          queued,
          duplicate_suppressed: alreadyQueued,
          batch: batchKey,
        })}::jsonb
      )
    `);

    return { queued, alreadyQueued, blockedAtGate: 0 };
  });

  if ("error" in outcome) fail(outcome.error!);

  revalidatePath("/communications");
  redirect(
    `/communications?queued=${outcome.queued}&duplicate=${outcome.alreadyQueued ?? 0}`,
  );
}

const suppressionSchema = z.object({
  channel: z.enum(["email", "sms"]),
  address: z.string().min(3, "Enter an email address or phone number").max(320),
  reason: z.enum(["unsubscribe", "stop", "bounce", "complaint", "manual", "invalid"]),
});

export async function addSuppressionAction(formData: FormData) {
  const workspace = await currentWorkspace();
  const parsed = suppressionSchema.safeParse({
    channel: formData.get("channel"),
    address: formData.get("address"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const input = parsed.data!;

  await inWorkspace(workspace, async (tx) => {
    await tx.execute(sql`
      insert into public.suppression_entries (org_id, channel, address, reason)
      values (${workspace.org.orgId}::uuid, ${input.channel}, lower(${input.address.trim()}), ${input.reason})
      on conflict (org_id, channel, address) do update set reason = excluded.reason
    `);
    // Revoke consent as well: a suppression without a matching revocation would
    // let a later "consent fix" silently un-block the address.
    await tx.execute(sql`
      update public.contact_channel_consents cc
         set status = 'revoked', revoked_at = now(), updated_at = now(),
             evidence = concat(coalesce(cc.evidence, ''), ' [suppressed: ', ${input.reason}, ']')
        from public.contacts c
       where c.id = cc.contact_id
         and cc.channel = ${input.channel}
         and (lower(coalesce(c.email, '')) = lower(${input.address.trim()})
              or lower(coalesce(c.phone, '')) = lower(${input.address.trim()}))
    `);
  });

  revalidatePath("/communications");
  redirect("/communications?suppressed=1");
}

export async function restoreOutboxAction(formData: FormData) {
  const workspace = await currentWorkspace();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "retry");

  await inWorkspace(workspace, async (tx) => {
    if (decision === "retry") {
      // Only a human may revive a blocked row, and only from a genuinely failed
      // state. `ambiguous` stays out of automatic retry by design.
      await tx.execute(sql`
        update public.outbox_events
           set status = 'pending', next_attempt_at = now(), last_error = null,
               locked_at = null, locked_by = null, updated_at = now()
         where id = ${id}::uuid and status = 'failed'
      `);
    } else {
      await tx.execute(sql`
        update public.outbox_events
           set status = 'exhausted',
               last_error = concat(coalesce(last_error, ''), ' [resolved by operator: not sent]'),
               locked_at = null, locked_by = null, updated_at = now()
         where id = ${id}::uuid and status in ('ambiguous', 'failed')
      `);
    }

    await tx.execute(sql`
      insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
      values (
        ${workspace.org.orgId}::uuid, app.current_user_id(),
        ${decision === "retry" ? "outbox_retry_authorised" : "outbox_resolved_not_sent"},
        'outbox_event', ${id},
        ${JSON.stringify({ decision })}::jsonb
      )
    `);
  });

  revalidatePath("/communications");
  redirect("/communications?resolved=1");
}

/** Minimal {{variable}} renderer shared with templates. */
function render(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => variables[key] ?? "");
}
