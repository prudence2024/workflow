import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Primary keys default in the database as well as in the application.
 * Database-level defaults keep direct SQL, worker and migration inserts valid
 * (the original schema only generated ids in Node, so any row inserted outside
 * the app failed the not-null constraint).
 */
const id = () =>
  uuid("id")
    .primaryKey()
    .defaultRandom()
    .$defaultFn(() => randomUUID());

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  /**
   * Identity is owned by Clerk. This column maps a local profile row to a
   * verified Clerk subject; it is the only trusted link between the two.
   * Nullable so legacy password-era rows remain readable during migration.
   */
  clerkUserId: text("clerk_user_id").unique(),
  /** Legacy custom-auth credential. Clerk owns credentials now; retained
   *  nullable for compatibility until the migration is verified complete. */
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  /** DEPRECATED denormalised flag: authorization reads platform_admins only. */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Authorization — database-driven RBAC
// Roles and permissions are data, not code. Server enforcement resolves a
// Clerk subject -> organization_members.role_id -> role_permissions and never
// trusts a browser-supplied role, org id or permission claim.
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_role_idx").on(table.roleId),
  ],
);

/**
 * Platform operators. Deliberately separate from customer memberships and
 * never derived from writable profile metadata: rows are created only by a
 * restricted server-side bootstrap that verifies the Clerk subject against
 * PLATFORM_ADMIN_CLERK_USER_ID.
 */
export const platformAdmins = pgTable("platform_admins", {
  id: id(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  active: boolean("active").notNull().default(true),
  createdByClerkUserId: text("created_by_clerk_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planKey: text("plan_key").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Legacy text role. Kept for compatibility; NOT authoritative. */
    role: text("role").notNull().default("member"),
    /** Authoritative role reference. */
    roleId: uuid("role_id").references(() => roles.id),
    /** Revocation is a data change, not a cookie change. */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("org_member_unique").on(table.orgId, table.userId),
    index("org_member_user_idx").on(table.userId, table.status),
    check("org_member_status_check", sql`${table.status} in ('active','suspended','revoked')`),
  ],
);

export const organizationInvitations = pgTable("organization_invitations", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type").notNull().default("text"),
    options: jsonb("options").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("custom_field_org_key_unique").on(table.orgId, table.key)],
);

export const contacts = pgTable("contacts", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  status: text("status").notNull().default("active"),
  customFields: jsonb("custom_fields").$type<Record<string, string>>().default({}),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
  nextAction: text("next_action"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contacts_org_active_idx").on(table.orgId, table.archivedAt),
  index("contacts_org_email_idx").on(table.orgId, table.email),
  index("contacts_org_phone_idx").on(table.orgId, table.phone),
]);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tag_org_name_unique").on(table.orgId, table.name)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] })],
);

export const notes = pgTable("notes", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable("activity_events", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("activity_org_created_idx").on(table.orgId, table.createdAt),
  index("activity_contact_created_idx").on(table.contactId, table.createdAt),
]);

// ---------------------------------------------------------------------------
// Campaigns / Forms
// ---------------------------------------------------------------------------

export const campaigns = pgTable("campaigns", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("custom"),
  status: text("status").notNull().default("draft"),
  formUrl: text("form_url"),
  formDefinition: jsonb("form_definition").$type<FormField[]>().default([]),
  fieldMapping: jsonb("field_mapping").$type<Record<string, string>>().default({}),
  stats: jsonb("stats").$type<Record<string, number>>().default({}),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FormField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

export const campaignRecords = pgTable("campaign_records", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  failureCategory: text("failure_category"),
  resultMessage: text("result_message"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("campaign_records_org_campaign_status_idx").on(
    table.orgId,
    table.campaignId,
    table.status,
  ),
]);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const imports = pgTable("imports", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  storagePath: text("storage_path"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  status: text("status").notNull().default("uploaded"),
  columns: jsonb("columns").$type<string[]>().default([]),
  mapping: jsonb("mapping").$type<Record<string, string>>().default({}),
  rows: jsonb("rows").$type<Record<string, string>[]>().default([]),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("imports_org_created_idx").on(table.orgId, table.createdAt)]);

export const importErrors = pgTable("import_errors", {
  id: id(),
  importId: uuid("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  errors: jsonb("errors").$type<string[]>().default([]),
  rawData: jsonb("raw_data").$type<Record<string, string>>().default({}),
});

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id"),
  templateId: uuid("template_id"),
  /** email | sms — keeps one truthful communication timeline per contact. */
  channel: text("channel").notNull().default("email"),
  subject: text("subject").notNull().default(" "),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  provider: text("provider").notNull().default("simulated"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [index("messages_org_status_idx").on(table.orgId, table.status, table.channel)]);

// ---------------------------------------------------------------------------
// Platform / Usage / Billing
// ---------------------------------------------------------------------------

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    periodStart: date("period_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [unique("usage_counter_unique").on(table.orgId, table.metric, table.periodStart)],
);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_logs_org_created_idx").on(table.orgId, table.createdAt),
  index("audit_logs_action_created_idx").on(table.action, table.createdAt),
]);

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  planKey: text("plan_key").notNull().default("free"),
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Durable outbox — provider dispatch and idempotency
// Financial or messaging completion must never depend on an inline provider
// call inside a web request. Rows are claimed with SKIP LOCKED, retried with
// backoff, and may end in the honest 'ambiguous' state when the provider
// outcome cannot be determined (uncertain external results are never
// reported as delivered).
// ---------------------------------------------------------------------------

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    status: text("status").notNull().default("pending"),
    lastError: text("last_error"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "outbox_status_check",
      sql`${table.status} in ('pending','processing','sent','failed','exhausted','ambiguous')`,
    ),
    index("outbox_claim_idx").on(table.status, table.nextAttemptAt),
    index("outbox_org_idx").on(table.orgId, table.createdAt),
  ],
);

/** Raw provider callbacks, recorded before processing for idempotent dedupe. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type"),
    signatureValid: boolean("signature_valid").notNull().default(false),
    status: text("status").notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("webhook_provider_event_unique").on(table.provider, table.eventId),
    index("webhook_status_idx").on(table.provider, table.status, table.receivedAt),
  ],
);

/** Per-message provider evidence. Acceptance is not delivery. */
export const messageEvents = pgTable(
  "message_events",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id"),
    status: text("status").notNull(),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("message_events_message_idx").on(table.messageId),
    index("message_events_org_status_idx").on(table.orgId, table.status),
  ],
);

/** Consent provenance per contact and channel. Absence is NOT consent. */
export const contactChannelConsents = pgTable(
  "contact_channel_consents",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("granted"),
    source: text("source"),
    evidence: text("evidence"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("consent_org_contact_channel_unique").on(table.orgId, table.contactId, table.channel),
    check("consent_channel_check", sql`${table.channel} in ('email','sms')`),
    check("consent_status_check", sql`${table.status} in ('granted','revoked')`),
  ],
);

/** Hard opt-out/stop/bounce list. Checked before every send attempt. */
export const suppressionEntries = pgTable(
  "suppression_entries",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    address: text("address").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("suppression_org_channel_address_unique").on(table.orgId, table.channel, table.address),
    check("suppression_channel_check", sql`${table.channel} in ('email','sms')`),
    check(
      "suppression_reason_check",
      sql`${table.reason} in ('unsubscribe','stop','bounce','complaint','manual','invalid')`,
    ),
  ],
);

export const files = pgTable("files", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
