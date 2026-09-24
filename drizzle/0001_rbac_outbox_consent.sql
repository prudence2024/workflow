CREATE TABLE "contact_channel_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'granted' NOT NULL,
	"source" text,
	"evidence" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_org_contact_channel_unique" UNIQUE("org_id","contact_id","channel"),
	CONSTRAINT "consent_channel_check" CHECK ("contact_channel_consents"."channel" in ('email','sms')),
	CONSTRAINT "consent_status_check" CHECK ("contact_channel_consents"."status" in ('granted','revoked'))
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid,
	"provider" text NOT NULL,
	"provider_event_id" text,
	"status" text NOT NULL,
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"event_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "outbox_status_check" CHECK ("outbox_events"."status" in ('pending','processing','sent','failed','exhausted','ambiguous'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_admins_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "suppression_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_org_channel_address_unique" UNIQUE("org_id","channel","address"),
	CONSTRAINT "suppression_channel_check" CHECK ("suppression_entries"."channel" in ('email','sms')),
	CONSTRAINT "suppression_reason_check" CHECK ("suppression_entries"."reason" in ('unsubscribe','stop','bounce','complaint','manual','invalid'))
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_provider_event_unique" UNIQUE("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "subject" SET DEFAULT ' ';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channel_consents" ADD CONSTRAINT "contact_channel_consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_events_message_idx" ON "message_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_events_org_status_idx" ON "message_events" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_org_idx" ON "outbox_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "webhook_status_idx" ON "webhook_events" USING btree ("provider","status","received_at");--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_org_created_idx" ON "activity_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_contact_created_idx" ON "activity_events" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "campaign_records_org_campaign_status_idx" ON "campaign_records" USING btree ("org_id","campaign_id","status");--> statement-breakpoint
CREATE INDEX "contacts_org_active_idx" ON "contacts" USING btree ("org_id","archived_at");--> statement-breakpoint
CREATE INDEX "contacts_org_email_idx" ON "contacts" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "contacts_org_phone_idx" ON "contacts" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "imports_org_created_idx" ON "imports" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_org_status_idx" ON "messages" USING btree ("org_id","status","channel");--> statement-breakpoint
CREATE INDEX "org_member_user_idx" ON "organization_members" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id");--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "org_member_status_check" CHECK ("organization_members"."status" in ('active','suspended','revoked'));