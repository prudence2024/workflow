import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { withTenant, type TenantTx } from "@/lib/tenant";
import { identityOf, type CurrentUser, type OrgMembership } from "@/lib/auth";
import { hasPermission } from "@/lib/authorization";

/**
 * Pending workspace invitations for a server-verified email address.
 * Uses the administrative connection because the invitee has no tenant
 * context yet; the email comes from Clerk, never from browser input, and
 * only the invitation token (already a bearer credential) is returned.
 */
export async function pendingInvitationsForEmail(
  email: string,
): Promise<{ token: string; orgName: string; role: string }[]> {
  const rows = await db.execute<{ token: string; org_name: string; role: string }>(sql`
    select i.token, o.name as org_name, i.role
      from public.organization_invitations i
      join public.organizations o on o.id = i.org_id
     where lower(i.email) = lower(${email})
       and i.status = 'pending'
       and i.expires_at > now()
     order by i.created_at desc
  `);
  return rows.rows.map((r) => ({ token: r.token, orgName: r.org_name, role: r.role }));
}

/**
 * The application data gateway.
 *
 * Customer-facing pages must NOT import `@/db`. That module holds the owner
 * connection, which has rolbypassrls — using it means row level security is
 * switched off and tenant safety depends on every developer remembering to add
 * `where org_id = ...` forever.
 *
 * Everything here runs as `workflow_app`: a role without bypassrls, inside a
 * transaction whose organisation context was proved against
 * organization_members by the database itself. A missing filter becomes a
 * non-error (fewer rows) instead of a cross-tenant leak.
 */
export type Workspace = { user: CurrentUser; org: OrgMembership };

export async function inWorkspace<T>(
  workspace: Workspace,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return withTenant(identityOf(workspace.user), workspace.org.orgId, fn);
}

export async function can(
  workspace: Workspace,
  permission: string,
): Promise<boolean> {
  const clerkSubject = workspace.user.clerkUserId;
  if (!clerkSubject) {
    // Legacy sessions resolve permissions from the database directly, using the
    // same function the definer path uses.
    return withTenant(identityOf(workspace.user), workspace.org.orgId, async (tx) => {
      const res = await tx.execute<{ ok: boolean }>(
        sql`select app.has_permission(${permission}) as ok`,
      );
      return Boolean(res.rows[0]?.ok);
    });
  }
  return hasPermission(clerkSubject, workspace.org.orgId, permission);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export type DashboardSummary = {
  contacts: number;
  activeCampaigns: number;
  attemptsThisMonth: number;
  successfulThisMonth: number;
  campaigns: {
    id: string;
    name: string;
    status: string;
    type: string;
    stats: Record<string, number>;
    updatedAt: Date;
  }[];
  recentImports: {
    id: string;
    fileName: string;
    status: string;
    totalRows: number;
    validRows: number;
    createdAt: Date;
  }[];
  attentionRecords: {
    id: string;
    campaignId: string;
    campaignName: string;
    status: string;
    resultMessage: string | null;
    updatedAt: Date;
  }[];
  activity: {
    id: string;
    type: string;
    message: string;
    createdAt: Date;
  }[];
};

export async function getDashboardSummary(workspace: Workspace): Promise<DashboardSummary> {
  return inWorkspace(workspace, async (tx) => {
    const summary = await tx.execute<{
      contacts: number;
      active_campaigns: number;
      attempts_this_month: number;
      successful_this_month: number;
    }>(sql`
      select
        (select count(*) from public.contacts
          where archived_at is null)::int as contacts,
        (select count(*) from public.campaigns
          where status = 'running')::int as active_campaigns,
        (select count(*) from public.campaign_records
          where created_at >= date_trunc('month', now())
            and status <> 'queued')::int as attempts_this_month,
        (select count(*) from public.campaign_records
          where created_at >= date_trunc('month', now())
            and status = 'successful')::int as successful_this_month
    `);

    const campaigns = await tx.execute<{
      id: string;
      name: string;
      status: string;
      type: string;
      stats: Record<string, number> | null;
      updated_at: Date;
    }>(sql`
      select id, name, status, type, stats, updated_at
        from public.campaigns
       where status in ('running','ready','paused')
       order by updated_at desc
       limit 5
    `);

    const recentImports = await tx.execute<{
      id: string;
      file_name: string;
      status: string;
      total_rows: number;
      valid_rows: number;
      created_at: Date;
    }>(sql`
      select id, file_name, status, total_rows, valid_rows, created_at
        from public.imports
       order by created_at desc
       limit 5
    `);

    const attention = await tx.execute<{
      id: string;
      campaign_id: string;
      campaign_name: string;
      status: string;
      result_message: string | null;
      updated_at: Date;
    }>(sql`
      select r.id, r.campaign_id, c.name as campaign_name, r.status, r.result_message, r.updated_at
        from public.campaign_records r
        join public.campaigns c on c.id = r.campaign_id
       where r.status in ('failed','human_action_required')
       order by r.updated_at desc
       limit 6
    `);

    const activity = await tx.execute<{
      id: string;
      type: string;
      message: string;
      created_at: Date;
    }>(sql`
      select id, type, message, created_at
        from public.activity_events
       order by created_at desc
       limit 8
    `);

    const row = summary.rows[0];
    return {
      contacts: row?.contacts ?? 0,
      activeCampaigns: row?.active_campaigns ?? 0,
      attemptsThisMonth: row?.attempts_this_month ?? 0,
      successfulThisMonth: row?.successful_this_month ?? 0,
      campaigns: campaigns.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        type: r.type,
        stats: r.stats ?? {},
        updatedAt: r.updated_at,
      })),
      recentImports: recentImports.rows.map((r) => ({
        id: r.id,
        fileName: r.file_name,
        status: r.status,
        totalRows: r.total_rows,
        validRows: r.valid_rows,
        createdAt: r.created_at,
      })),
      attentionRecords: attention.rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        status: r.status,
        resultMessage: r.result_message,
        updatedAt: r.updated_at,
      })),
      activity: activity.rows.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        createdAt: r.created_at,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Form operations console
// ---------------------------------------------------------------------------
export type FormOperationsCampaign = {
  id: string;
  name: string;
  status: string;
  formUrl: string | null;
  totalFields: number;
  mappedFields: number;
  successful: number;
  needsAttention: number;
  updatedAt: Date;
};

export type FormOperationsAttention = {
  id: string;
  contactId: string;
  contactName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  attempts: number;
  resultMessage: string | null;
  updatedAt: Date;
};

export type FormOperationsOverview = {
  campaigns: FormOperationsCampaign[];
  attention: FormOperationsAttention[];
  totalFields: number;
  mappedFields: number;
  attempts: number;
  successful: number;
};

/**
 * Everything the Form Operations console shows, computed in one tenant-scoped
 * transaction. `form_definition` and `field_mapping` are jsonb arrays/maps set
 * by the analyzer, so coverage is derived in SQL from their cardinality.
 */
export async function getFormOperationsOverview(workspace: Workspace): Promise<FormOperationsOverview> {
  return inWorkspace(workspace, async (tx) => {
    const campaigns = await tx.execute<{
      id: string;
      name: string;
      status: string;
      form_url: string | null;
      total_fields: number;
      mapped_fields: number;
      successful: number;
      needs_attention: number;
      updated_at: Date;
    }>(sql`
      select c.id, c.name, c.status, c.form_url, c.updated_at,
             coalesce(jsonb_array_length(c.form_definition), 0)::int as total_fields,
             coalesce((
               select count(*)::int
                 from jsonb_object_keys(c.field_mapping) k
                where coalesce(c.field_mapping ->> k, '') <> ''
             ), 0) as mapped_fields,
             coalesce((c.stats ->> 'successful')::int, 0) as successful,
             coalesce((c.stats ->> 'failed')::int, 0)
               + coalesce((c.stats ->> 'human_action_required')::int, 0) as needs_attention
        from public.campaigns c
       where c.form_definition is not null
         and jsonb_array_length(c.form_definition) > 0
       order by c.updated_at desc
       limit 50
    `);

    const attention = await tx.execute<{
      id: string;
      contact_id: string;
      contact_name: string;
      campaign_id: string;
      campaign_name: string;
      status: string;
      attempts: number;
      result_message: string | null;
      updated_at: Date;
    }>(sql`
      select r.id, r.contact_id, r.campaign_id, r.status, r.attempts,
             r.result_message, r.updated_at,
             trim(c.first_name || ' ' || c.last_name) as contact_name,
             k.name as campaign_name
        from public.campaign_records r
        join public.contacts c on c.id = r.contact_id
        join public.campaigns k on k.id = r.campaign_id
       where r.status in ('failed', 'human_action_required')
       order by r.updated_at desc
       limit 25
    `);

    const attemptsRow = await tx.execute<{ attempts: number; successful: number }>(sql`
      select count(*)::int as attempts,
             count(*) filter (where status = 'successful')::int as successful
        from public.campaign_records
    `);

    const mappedFields = campaigns.rows.reduce((sum, r) => sum + r.mapped_fields, 0);
    const totalFields = campaigns.rows.reduce((sum, r) => sum + r.total_fields, 0);

    return {
      campaigns: campaigns.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        formUrl: r.form_url,
        totalFields: r.total_fields,
        mappedFields: r.mapped_fields,
        successful: r.successful,
        needsAttention: r.needs_attention,
        updatedAt: r.updated_at,
      })),
      attention: attention.rows.map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        status: r.status,
        attempts: r.attempts,
        resultMessage: r.result_message,
        updatedAt: r.updated_at,
      })),
      totalFields,
      mappedFields,
      attempts: attemptsRow.rows[0]?.attempts ?? 0,
      successful: attemptsRow.rows[0]?.successful ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Records (contacts)
// ---------------------------------------------------------------------------
export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  createdAt: Date;
  tags: string[];
  emailConsent: string | null;
  smsConsent: string | null;
  suppressed: boolean;
};

export async function listContacts(
  workspace: Workspace,
  options: { search?: string; limit?: number } = {},
): Promise<ContactRow[]> {
  const search = (options.search ?? "").trim();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const like = `%${search}%`;

  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      status: string;
      created_at: Date;
      tags: string[] | null;
      email_consent: string | null;
      sms_consent: string | null;
      suppressed: boolean;
    }>(sql`
      select
        c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.status, c.created_at,
        coalesce(array_agg(distinct t.name) filter (where t.name is not null), '{}') as tags,
        (select cc.status from public.contact_channel_consents cc
          where cc.contact_id = c.id and cc.channel = 'email') as email_consent,
        (select cc.status from public.contact_channel_consents cc
          where cc.contact_id = c.id and cc.channel = 'sms') as sms_consent,
        exists (
          select 1 from public.suppression_entries s
           where (lower(s.address) = lower(coalesce(c.email, ''))
                  or lower(s.address) = lower(coalesce(c.phone, '')))
        ) as suppressed
      from public.contacts c
      left join public.contact_tags ct on ct.contact_id = c.id
      left join public.tags t on t.id = ct.tag_id
      where c.archived_at is null
        and (
          ${search} = ''
          or c.first_name ilike ${like}
          or c.last_name ilike ${like}
          or coalesce(c.email, '') ilike ${like}
          or coalesce(c.phone, '') ilike ${like}
        )
      group by c.id
      order by c.created_at desc
      limit ${limit}
    `);

    return res.rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      status: r.status,
      createdAt: r.created_at,
      tags: r.tags ?? [],
      emailConsent: r.email_consent,
      smsConsent: r.sms_consent,
      suppressed: r.suppressed,
    }));
  });
}

export async function countContacts(workspace: Workspace): Promise<number> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from public.contacts where archived_at is null`,
    );
    return res.rows[0]?.n ?? 0;
  });
}

// ---------------------------------------------------------------------------
// Communications Centre
// ---------------------------------------------------------------------------
export type ChannelReadiness = {
  channel: "email" | "sms";
  provider: string;
  providerConfigured: boolean;
  /** Addresses that may be sent to right now, by this workspace's own rules. */
  eligible: number;
  blockedNoConsent: number;
  blockedSuppressed: number;
  blockedMissingAddress: number;
};

export async function getChannelReadiness(workspace: Workspace): Promise<ChannelReadiness[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      channel: string;
      eligible: number;
      no_consent: number;
      suppressed: number;
      missing: number;
    }>(sql`
      with channels(channel, address_expr) as (
        values ('email', 'email'::text), ('sms', 'phone'::text)
      ),
      base as (
        select ch.channel,
               c.id,
               trim(coalesce(case when ch.channel = 'email' then c.email else c.phone end, '')) as address,
               (select cc.status from public.contact_channel_consents cc
                 where cc.contact_id = c.id and cc.channel = ch.channel limit 1) as consent
          from public.contacts c
          cross join channels ch
         where c.archived_at is null
      ),
      scored as (
        select b.channel,
               b.address,
               b.consent,
               exists (
                 select 1 from public.suppression_entries s
                  where s.channel = b.channel and lower(s.address) = lower(b.address)
               ) as is_suppressed
          from base b
      )
      select channel,
             count(*) filter (where address <> '' and consent = 'granted' and not is_suppressed)::int as eligible,
             count(*) filter (where address <> '' and consent is distinct from 'granted' and not is_suppressed)::int as no_consent,
             count(*) filter (where address <> '' and is_suppressed)::int as suppressed,
             count(*) filter (where address = '')::int as missing
        from scored
       group by channel
    `);

    const configured: Record<string, { provider: string; ok: boolean }> = {
      email: { provider: "resend", ok: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) },
      sms: {
        provider: "termii",
        ok: Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID),
      },
    };

    return res.rows.map((r) => ({
      channel: r.channel as "email" | "sms",
      provider: configured[r.channel].provider,
      providerConfigured: configured[r.channel].ok,
      eligible: r.eligible,
      blockedNoConsent: r.no_consent,
      blockedSuppressed: r.suppressed,
      blockedMissingAddress: r.missing,
    }));
  });
}

export type OutboxRowView = {
  id: string;
  eventType: string;
  provider: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
  to: string | null;
  subject: string | null;
};

export async function listOutbox(
  workspace: Workspace,
  limit = 40,
): Promise<{ rows: OutboxRowView[]; counts: Record<string, number> }> {
  return inWorkspace(workspace, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      event_type: string;
      provider: string;
      status: string;
      attempt_count: number;
      max_attempts: number;
      last_error: string | null;
      created_at: Date;
      sent_at: Date | null;
      to: string | null;
      subject: string | null;
    }>(sql`
      select id, event_type, provider, status, attempt_count, max_attempts, last_error,
             created_at, sent_at,
             payload->>'to' as "to",
             payload->>'subject' as subject
        from public.outbox_events
       order by created_at desc
       limit ${limit}
    `);

    const counts = await tx.execute<{ status: string; n: number }>(sql`
      select status, count(*)::int as n from public.outbox_events group by status
    `);

    return {
      rows: rows.rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        provider: r.provider,
        status: r.status,
        attemptCount: r.attempt_count,
        maxAttempts: r.max_attempts,
        lastError: r.last_error,
        createdAt: r.created_at,
        sentAt: r.sent_at,
        to: r.to,
        subject: r.subject,
      })),
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    };
  });
}

export type MessageRowView = {
  id: string;
  channel: string;
  status: string;
  provider: string;
  providerMessageId: string | null;
  subject: string;
  contactName: string;
  lastEvent: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

export async function listMessages(workspace: Workspace, limit = 30): Promise<MessageRowView[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      channel: string;
      status: string;
      provider: string;
      provider_message_id: string | null;
      subject: string;
      contact_name: string;
      last_event: string | null;
      created_at: Date;
      sent_at: Date | null;
    }>(sql`
      select m.id, m.channel, m.status, m.provider, m.provider_message_id, m.subject,
             trim(c.first_name || ' ' || c.last_name) as contact_name,
             (select e.status from public.message_events e
               where e.message_id = m.id order by e.occurred_at desc limit 1) as last_event,
             m.created_at, m.sent_at
        from public.messages m
        left join public.contacts c on c.id = m.contact_id
       order by m.created_at desc
       limit ${limit}
    `);

    return res.rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      status: r.status,
      provider: r.provider,
      providerMessageId: r.provider_message_id,
      subject: r.subject,
      contactName: r.contact_name ?? "Unknown contact",
      lastEvent: r.last_event,
      createdAt: r.created_at,
      sentAt: r.sent_at,
    }));
  });
}

export type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export async function listTemplates(workspace: Workspace): Promise<TemplateRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<TemplateRow>(sql`
      select id, name, subject, body from public.message_templates order by name
    `);
    return res.rows;
  });
}

export type SuppressionRow = {
  id: string;
  channel: string;
  address: string;
  reason: string;
  createdAt: Date;
};

export async function listSuppressions(workspace: Workspace): Promise<SuppressionRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      channel: string;
      address: string;
      reason: string;
      created_at: Date;
    }>(sql`
      select id, channel, address, reason, created_at
        from public.suppression_entries
       order by created_at desc
       limit 50
    `);
    return res.rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      address: r.address,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  });
}

export type EligibleRecipient = {
  contactId: string;
  name: string;
  address: string;
};
/** The exact audience a send would reach — the same rule the worker applies. */
export async function previewAudience(
  workspace: Workspace,
  channel: "email" | "sms",
  limit = 100,
): Promise<EligibleRecipient[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{ contact_id: string; name: string; address: string }>(sql`
      select c.id as contact_id,
             trim(c.first_name || ' ' || c.last_name) as name,
             trim(case when ${channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end) as address
        from public.contacts c
       where c.archived_at is null
         and trim(case when ${channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end) <> ''
         and exists (
           select 1 from public.contact_channel_consents cc
            where cc.contact_id = c.id and cc.channel = ${channel} and cc.status = 'granted'
         )
         and not exists (
           select 1 from public.suppression_entries s
            where s.channel = ${channel}
              and lower(s.address) = lower(trim(case when ${channel} = 'email' then coalesce(c.email, '') else coalesce(c.phone, '') end))
         )
       order by c.created_at
       limit ${limit}
    `);
    return res.rows.map((r) => ({ contactId: r.contact_id, name: r.name, address: r.address }));
  });
}

// ---------------------------------------------------------------------------
// Paginated records (contacts) — tenant-scoped replacement for the direct
// drizzle reads the Records screens used previously through the owner
// connection. Runs as `workflow_app` with database-verified org context.
// ---------------------------------------------------------------------------
export type ContactPageRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  tags: string[];
};

export async function listContactsPage(
  workspace: Workspace,
  options: { search?: string; showArchived?: boolean; page?: number; pageSize?: number } = {},
): Promise<{ rows: ContactPageRow[]; total: number }> {
  const search = (options.search ?? "").trim();
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const like = `%${search}%`;

  return inWorkspace(workspace, async (tx) => {
    const totalRes = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from public.contacts c
       where c.archived_at is ${options.showArchived ? sql`not null` : sql`null`}
         and (
           ${search} = ''
           or c.first_name ilike ${like}
           or c.last_name ilike ${like}
           or coalesce(c.email, '') ilike ${like}
           or coalesce(c.phone, '') ilike ${like}
         )
    `);

    const rows = await tx.execute<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      status: string;
      created_at: Date;
      tags: string[] | null;
    }>(sql`
      select c.id, c.first_name, c.last_name, c.email, c.phone, c.status, c.created_at,
             coalesce(array_agg(distinct t.name) filter (where t.name is not null), '{}') as tags
        from public.contacts c
        left join public.contact_tags ct on ct.contact_id = c.id
        left join public.tags t on t.id = ct.tag_id
       where c.archived_at is ${options.showArchived ? sql`not null` : sql`null`}
         and (
           ${search} = ''
           or c.first_name ilike ${like}
           or c.last_name ilike ${like}
           or coalesce(c.email, '') ilike ${like}
           or coalesce(c.phone, '') ilike ${like}
         )
       group by c.id
       order by c.created_at desc
       limit ${pageSize} offset ${offset}
    `);

    return {
      total: totalRes.rows[0]?.n ?? 0,
      rows: rows.rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        createdAt: r.created_at,
        tags: r.tags ?? [],
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Campaigns — list and detail, tenant-scoped.
// ---------------------------------------------------------------------------
export type CampaignListRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  stats: Record<string, number>;
  updatedAt: Date;
};

export async function listCampaigns(workspace: Workspace): Promise<CampaignListRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      name: string;
      type: string;
      status: string;
      stats: Record<string, number> | null;
      updated_at: Date;
    }>(sql`
      select id, name, type, status, stats, updated_at
        from public.campaigns
       order by updated_at desc
    `);
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      stats: r.stats ?? {},
      updatedAt: r.updated_at,
    }));
  });
}

export type CampaignRecordRow = {
  id: string;
  status: string;
  resultMessage: string | null;
  attempts: number;
  updatedAt: Date;
  contactId: string;
  contactName: string;
  email: string | null;
  /** Destination-observed confirmation proof; present only on real successes. */
  evidence: Record<string, unknown> | null;
};

export async function getCampaignDetail(
  workspace: Workspace,
  campaignId: string,
): Promise<{
  campaign: {
    id: string;
    name: string;
    type: string;
    status: string;
    formUrl: string | null;
    formDefinition: unknown;
    fieldMapping: Record<string, string>;
    stats: Record<string, number>;
    updatedAt: Date;
  } | null;
  records: CampaignRecordRow[];
  templates: { id: string; name: string }[];
  customFields: { key: string; label: string }[];
}> {
  return inWorkspace(workspace, async (tx) => {
    const campaignRes = await tx.execute<{
      id: string;
      name: string;
      type: string;
      status: string;
      form_url: string | null;
      form_definition: unknown;
      field_mapping: Record<string, string> | null;
      stats: Record<string, number> | null;
      updated_at: Date;
    }>(sql`
      select id, name, type, status, form_url, form_definition, field_mapping, stats, updated_at
        from public.campaigns
       where id = ${campaignId}::uuid
       limit 1
    `);
    if (campaignRes.rows.length === 0) {
      return { campaign: null, records: [], templates: [], customFields: [] };
    }
    const c = campaignRes.rows[0];

    const records = await tx.execute<{
      id: string;
      status: string;
      result_message: string | null;
      attempts: number;
      updated_at: Date;
      contact_id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      submission_evidence: Record<string, unknown> | null;
    }>(sql`
      select r.id, r.status, r.result_message, r.attempts, r.updated_at,
             r.submission_evidence,
             c.id as contact_id, c.first_name, c.last_name, c.email
        from public.campaign_records r
        join public.contacts c on c.id = r.contact_id
       where r.campaign_id = ${campaignId}::uuid
       order by r.updated_at desc
       limit 100
    `);

    const templates = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.message_templates order by name
    `);

    const fields = await tx.execute<{ key: string; label: string }>(sql`
      select key, label from public.custom_field_definitions order by created_at
    `);

    return {
      campaign: {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        formUrl: c.form_url,
        formDefinition: c.form_definition ?? [],
        fieldMapping: c.field_mapping ?? {},
        stats: c.stats ?? {},
        updatedAt: c.updated_at,
      },
      records: records.rows.map((r) => ({
        id: r.id,
        status: r.status,
        resultMessage: r.result_message,
        attempts: r.attempts,
        updatedAt: r.updated_at,
        contactId: r.contact_id,
        contactName: `${r.first_name} ${r.last_name}`.trim(),
        email: r.email,
        evidence: r.submission_evidence,
      })),
      templates: templates.rows,
      customFields: fields.rows,
    };
  });
}

// ---------------------------------------------------------------------------
// Imports — list and detail, tenant-scoped.
// ---------------------------------------------------------------------------
export type ImportListRow = {
  id: string;
  fileName: string;
  fileType: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  status: string;
  createdAt: Date;
};

export async function listImports(workspace: Workspace): Promise<ImportListRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      file_name: string;
      file_type: string;
      total_rows: number;
      valid_rows: number;
      invalid_rows: number;
      duplicate_rows: number;
      status: string;
      created_at: Date;
    }>(sql`
      select id, file_name, file_type, total_rows, valid_rows, invalid_rows, duplicate_rows, status, created_at
        from public.imports
       order by created_at desc
    `);
    return res.rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      totalRows: r.total_rows,
      validRows: r.valid_rows,
      invalidRows: r.invalid_rows,
      duplicateRows: r.duplicate_rows,
      status: r.status,
      createdAt: r.created_at,
    }));
  });
}

export async function getImportDetail(
  workspace: Workspace,
  importId: string,
): Promise<{
  record: {
    id: string;
    fileName: string;
    fileType: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    status: string;
    columns: string[];
    mapping: Record<string, string>;
    createdAt: Date;
  } | null;
  errors: { id: string; rowNumber: number; errors: string[]; rawData: Record<string, string> }[];
  customFields: { id: string; key: string; label: string }[];
}> {
  return inWorkspace(workspace, async (tx) => {
    const rec = await tx.execute<{
      id: string;
      file_name: string;
      file_type: string;
      total_rows: number;
      valid_rows: number;
      invalid_rows: number;
      duplicate_rows: number;
      status: string;
      columns: string[] | null;
      mapping: Record<string, string> | null;
      created_at: Date;
    }>(sql`
      select id, file_name, file_type, total_rows, valid_rows, invalid_rows, duplicate_rows,
             status, columns, mapping, created_at
        from public.imports
       where id = ${importId}::uuid
       limit 1
    `);
    if (rec.rows.length === 0) return { record: null, errors: [], customFields: [] };
    const r = rec.rows[0];

    const errorsRes =
      r.status === "validated" || r.status === "imported"
        ? await tx.execute<{
            id: string;
            row_number: number;
            errors: string[] | null;
            raw_data: Record<string, string> | null;
          }>(sql`
            select id, row_number, errors, raw_data
              from public.import_errors
             where import_id = ${importId}::uuid
             order by row_number
             limit 50
          `)
        : { rows: [] };

    const fields = await tx.execute<{ id: string; key: string; label: string }>(sql`
      select id, key, label from public.custom_field_definitions order by created_at
    `);

    return {
      record: {
        id: r.id,
        fileName: r.file_name,
        fileType: r.file_type,
        totalRows: r.total_rows,
        validRows: r.valid_rows,
        invalidRows: r.invalid_rows,
        duplicateRows: r.duplicate_rows,
        status: r.status,
        columns: r.columns ?? [],
        mapping: r.mapping ?? {},
        createdAt: r.created_at,
      },
      errors: errorsRes.rows.map((e) => ({
        id: e.id,
        rowNumber: e.row_number,
        errors: e.errors ?? [],
        rawData: e.raw_data ?? {},
      })),
      customFields: fields.rows,
    };
  });
}

// ---------------------------------------------------------------------------
// Campaign audience — contacts eligible to be added, tenant-scoped.
// ---------------------------------------------------------------------------
export async function getCampaignAudienceCandidates(
  workspace: Workspace,
  campaignId: string,
): Promise<{
  campaign: { id: string; name: string } | null;
  availableContacts: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  }[];
}> {
  return inWorkspace(workspace, async (tx) => {
    const c = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.campaigns where id = ${campaignId}::uuid limit 1
    `);
    if (c.rows.length === 0) return { campaign: null, availableContacts: [] };

    const res = await tx.execute<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    }>(sql`
      select c.id, c.first_name, c.last_name, c.email, c.phone
        from public.contacts c
       where c.archived_at is null
         and not exists (
           select 1 from public.campaign_records cr
            where cr.campaign_id = ${campaignId}::uuid and cr.contact_id = c.id
         )
       order by c.created_at desc
       limit 200
    `);
    return {
      campaign: c.rows[0],
      availableContacts: res.rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Exports — full-row reads used by the CSV/XLSX download routes.
// ---------------------------------------------------------------------------
export type ContactExportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  status: string;
  createdAt: Date;
};

export async function listContactExportRows(workspace: Workspace): Promise<ContactExportRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      address: string | null;
      status: string;
      created_at: Date;
    }>(sql`
      select first_name, last_name, email, phone, company, address, status, created_at
        from public.contacts
       where archived_at is null
       order by created_at desc
    `);
    return res.rows.map((r) => ({
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      address: r.address,
      status: r.status,
      createdAt: r.created_at,
    }));
  });
}

export type CampaignReportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  failureCategory: string | null;
  resultMessage: string | null;
  attempts: number;
  updatedAt: Date;
};

export async function getCampaignReportRows(
  workspace: Workspace,
  campaignId: string,
): Promise<{ campaign: { id: string; name: string } | null; rows: CampaignReportRow[] }> {
  return inWorkspace(workspace, async (tx) => {
    const c = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.campaigns where id = ${campaignId}::uuid limit 1
    `);
    if (c.rows.length === 0) return { campaign: null, rows: [] };

    const res = await tx.execute<{
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      status: string;
      failure_category: string | null;
      result_message: string | null;
      attempts: number;
      updated_at: Date;
    }>(sql`
      select ct.first_name, ct.last_name, ct.email, ct.phone,
             cr.status, cr.failure_category, cr.result_message, cr.attempts, cr.updated_at
        from public.campaign_records cr
        join public.contacts ct on ct.id = cr.contact_id
       where cr.campaign_id = ${campaignId}::uuid
       order by cr.updated_at desc
    `);
    return {
      campaign: c.rows[0],
      rows: res.rows.map((r) => ({
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        failureCategory: r.failure_category,
        resultMessage: r.result_message,
        attempts: r.attempts,
        updatedAt: r.updated_at,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Reports — per-campaign outcome table, tenant-scoped.
// ---------------------------------------------------------------------------
export type ReportRow = {
  id: string;
  name: string;
  stats: Record<string, number>;
  status: string;
  updatedAt: Date;
};

export async function listReportCampaigns(workspace: Workspace): Promise<ReportRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      name: string;
      stats: Record<string, number> | null;
      status: string;
      updated_at: Date;
    }>(sql`
      select id, name, stats, status, updated_at
        from public.campaigns
       order by updated_at desc
    `);
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      stats: r.stats ?? {},
      status: r.status,
      updatedAt: r.updated_at,
    }));
  });
}

// ---------------------------------------------------------------------------
// Workspace settings — members, invitations and custom fields, tenant-scoped.
// ---------------------------------------------------------------------------
export type SettingsMemberRow = {
  id: string;
  role: string;
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
};

export async function listWorkspaceMembers(workspace: Workspace): Promise<SettingsMemberRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      role: string;
      user_id: string;
      name: string;
      email: string;
      joined_at: Date;
    }>(sql`
      select m.id, coalesce(m.role, 'member') as role, u.id as user_id, u.name, u.email, m.created_at as joined_at
        from public.organization_members m
        join public.users u on u.id = m.user_id
       where m.org_id = ${workspace.org.orgId}::uuid
       order by m.created_at desc
    `);
    return res.rows.map((r) => ({
      id: r.id,
      role: r.role,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      joinedAt: r.joined_at,
    }));
  });
}

export type SettingsInvitationRow = {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
};

export async function listPendingInvitations(workspace: Workspace): Promise<SettingsInvitationRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      email: string;
      role: string;
      created_at: Date;
      expires_at: Date;
    }>(sql`
      select id, email, role, created_at, expires_at
        from public.organization_invitations
       where org_id = ${workspace.org.orgId}::uuid and status = 'pending'
       order by created_at desc
    `);
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  });
}

export type CustomFieldRow = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string[];
};

export async function listCustomFields(workspace: Workspace): Promise<CustomFieldRow[]> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{
      id: string;
      key: string;
      label: string;
      field_type: string;
      options: string[] | null;
    }>(sql`
      select id, key, label, field_type, options
        from public.custom_field_definitions
       order by created_at
    `);
    return res.rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      fieldType: r.field_type,
      options: r.options ?? [],
    }));
  });
}

// ---------------------------------------------------------------------------
// Contacts — single-record timeline (detail screen), tenant-scoped.
// ---------------------------------------------------------------------------
export type ContactDetail = {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    address: string | null;
    status: string;
    customFields: Record<string, string>;
    nextAction: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  tags: { id: string; name: string }[];
  allTags: { id: string; name: string }[];
  notes: { id: string; body: string; author: string | null; createdAt: Date }[];
  activity: { id: string; type: string; message: string; createdAt: Date }[];
  messages: { id: string; channel: string; status: string; subject: string; createdAt: Date }[];
  campaignHistory: {
    id: string;
    status: string;
    resultMessage: string | null;
    updatedAt: Date;
    campaignId: string;
    campaignName: string;
  }[];
  emailConsent: string | null;
  smsConsent: string | null;
};

export async function getContactDetail(workspace: Workspace, contactId: string): Promise<ContactDetail> {
  return inWorkspace(workspace, async (tx) => {
    const c = await tx.execute<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      address: string | null;
      status: string;
      custom_fields: Record<string, string> | null;
      next_action: string | null;
      archived_at: Date | null;
      created_at: Date;
      updated_at: Date;
      email_consent: string | null;
      sms_consent: string | null;
    }>(sql`
      select c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.address, c.status,
             c.custom_fields, c.next_action, c.archived_at, c.created_at, c.updated_at,
             (select cc.status from public.contact_channel_consents cc
               where cc.contact_id = c.id and cc.channel = 'email' limit 1) as email_consent,
             (select cc.status from public.contact_channel_consents cc
               where cc.contact_id = c.id and cc.channel = 'sms' limit 1) as sms_consent
        from public.contacts c
       where c.id = ${contactId}::uuid
       limit 1
    `);
    if (c.rows.length === 0) {
      return {
        contact: null,
        tags: [],
        allTags: [],
        notes: [],
        activity: [],
        messages: [],
        campaignHistory: [],
        emailConsent: null,
        smsConsent: null,
      };
    }
    const row = c.rows[0];

    const tagsRes = await tx.execute<{ id: string; name: string }>(sql`
      select t.id, t.name from public.contact_tags ct
        join public.tags t on t.id = ct.tag_id
       where ct.contact_id = ${contactId}::uuid
       order by t.name
    `);
    const allTagsRes = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.tags order by name
    `);
    const campaignHistoryRes = await tx.execute<{
      id: string;
      status: string;
      result_message: string | null;
      updated_at: Date;
      campaign_id: string;
      campaign_name: string;
    }>(sql`
      select cr.id, cr.status, cr.result_message, cr.updated_at,
             c.id as campaign_id, c.name as campaign_name
        from public.campaign_records cr
        join public.campaigns c on c.id = cr.campaign_id
       where cr.contact_id = ${contactId}::uuid
       order by cr.updated_at desc
    `);
    const notesRes = await tx.execute<{ id: string; body: string; author: string | null; created_at: Date }>(sql`
      select n.id, n.body, u.name as author, n.created_at
        from public.notes n
        left join public.users u on u.id = n.author_user_id
       where n.contact_id = ${contactId}::uuid
       order by n.created_at desc
       limit 50
    `);
    const activityRes = await tx.execute<{ id: string; type: string; message: string; created_at: Date }>(sql`
      select id, type, message, created_at from public.activity_events
       where contact_id = ${contactId}::uuid
       order by created_at desc
       limit 30
    `);
    const messagesRes = await tx.execute<{ id: string; channel: string; status: string; subject: string; created_at: Date }>(sql`
      select id, channel, status, subject, created_at from public.messages
       where contact_id = ${contactId}::uuid
       order by created_at desc
       limit 20
    `);

    return {
      contact: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        company: row.company,
        address: row.address,
        status: row.status,
        customFields: row.custom_fields ?? {},
        nextAction: row.next_action,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      tags: tagsRes.rows.map((t) => ({ id: t.id, name: t.name })),
      allTags: allTagsRes.rows.map((t) => ({ id: t.id, name: t.name })),
      campaignHistory: campaignHistoryRes.rows.map((h) => ({
        id: h.id,
        status: h.status,
        resultMessage: h.result_message,
        updatedAt: h.updated_at,
        campaignId: h.campaign_id,
        campaignName: h.campaign_name,
      })),
      notes: notesRes.rows.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author,
        createdAt: n.created_at,
      })),
      activity: activityRes.rows.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        createdAt: a.created_at,
      })),
      messages: messagesRes.rows.map((m) => ({
        id: m.id,
        channel: m.channel,
        status: m.status,
        subject: m.subject,
        createdAt: m.created_at,
      })),
      emailConsent: row.email_consent,
      smsConsent: row.sms_consent,
    };
  });
}

// ---------------------------------------------------------------------------
// Usage counters — tenant-scoped replacement for the privileged usage reader
// the dashboard and usage settings screens used previously.
// ---------------------------------------------------------------------------
export async function getUsageCounters(workspace: Workspace): Promise<Record<string, number>> {
  return inWorkspace(workspace, async (tx) => {
    const res = await tx.execute<{ metric: string; count: number }>(sql`
      select metric, count
        from public.usage_counters
       where period_start = date_trunc('month', now())::date
    `);
    return Object.fromEntries(res.rows.map((r) => [r.metric, r.count]));
  });
}
