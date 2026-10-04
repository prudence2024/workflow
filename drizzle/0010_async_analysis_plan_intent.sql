CREATE TABLE "form_analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"form_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_analysis_jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "form_analysis_job_status_check" CHECK ("form_analysis_jobs"."status" in ('queued','processing','ready','needs_attention','failed'))
);
--> statement-breakpoint
ALTER TABLE "campaign_records" DROP CONSTRAINT "campaign_record_status_check";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "form_analysis_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "form_analysis_error" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "form_analysis_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "requested_plan_key" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "form_analysis_jobs" ADD CONSTRAINT "form_analysis_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_analysis_jobs" ADD CONSTRAINT "form_analysis_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_analysis_job_claim_idx" ON "form_analysis_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "form_analysis_job_campaign_idx" ON "form_analysis_jobs" USING btree ("org_id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_records" ADD CONSTRAINT "campaign_record_status_check" CHECK ("campaign_records"."status" in ('queued','processing','successful','failed','retrying','cancelled','human_action_required','needs_attention','unverified','skipped','pending_review','review'));
-- New queue table is tenant-scoped for the app and claimable only by the external Node worker.
ALTER TABLE public.form_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_analysis_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.form_analysis_jobs;
CREATE POLICY tenant_isolation ON public.form_analysis_jobs
  FOR ALL TO workflow_app
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());
DROP POLICY IF EXISTS worker_form_analysis_read ON public.form_analysis_jobs;
CREATE POLICY worker_form_analysis_read ON public.form_analysis_jobs
  FOR SELECT TO workflow_worker USING (true);
DROP POLICY IF EXISTS worker_form_analysis_update ON public.form_analysis_jobs;
CREATE POLICY worker_form_analysis_update ON public.form_analysis_jobs
  FOR UPDATE TO workflow_worker USING (true) WITH CHECK (true);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_analysis_jobs TO workflow_app;
GRANT SELECT, UPDATE ON public.form_analysis_jobs TO workflow_worker;

-- Seed data used the legacy growth key; the canonical plan catalogue calls it pro.
UPDATE public.organizations SET plan_key = 'pro' WHERE plan_key = 'growth';
UPDATE public.subscriptions SET plan_key = 'pro' WHERE plan_key = 'growth';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_key_check
  CHECK (plan_key IN ('free','pro','business'));
-- Seed data used the legacy growth key; the canonical plan catalogue calls it pro.
UPDATE public.organizations SET plan_key = 'pro' WHERE plan_key = 'growth';
UPDATE public.subscriptions SET plan_key = 'pro' WHERE plan_key = 'growth';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_requested_plan_key_check
  CHECK (requested_plan_key IS NULL OR requested_plan_key IN ('free','pro','business'));
-- Seed data used the legacy growth key; the canonical plan catalogue calls it pro.
UPDATE public.organizations SET plan_key = 'pro' WHERE plan_key = 'growth';
UPDATE public.subscriptions SET plan_key = 'pro' WHERE plan_key = 'growth';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_state_check
  CHECK (billing_state IN ('active','pending_payment','past_due','cancelled'));

DO $$
DECLARE
  v_rls boolean;
  v_bypass integer;
  v_policies integer;
BEGIN
  SELECT relforcerowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.form_analysis_jobs'::regclass;
  IF NOT COALESCE(v_rls, false) THEN RAISE EXCEPTION '0010 form_analysis_jobs must be FORCE RLS'; END IF;
  SELECT count(*) INTO v_policies FROM pg_policies
    WHERE schemaname = 'public' AND ((tablename = 'form_analysis_jobs' AND policyname = 'tenant_isolation')
      OR (tablename = 'form_analysis_jobs' AND policyname = 'worker_form_analysis_read')
      OR (tablename = 'form_analysis_jobs' AND policyname = 'worker_form_analysis_update'));
  IF v_policies <> 3 THEN RAISE EXCEPTION '0010 form analysis policies missing (found %)', v_policies; END IF;
  SELECT count(*) INTO v_bypass FROM pg_roles WHERE rolname IN ('workflow_app','workflow_worker') AND rolbypassrls;
  IF v_bypass <> 0 THEN RAISE EXCEPTION 'restricted roles must never have BYPASSRLS'; END IF;
END $$;