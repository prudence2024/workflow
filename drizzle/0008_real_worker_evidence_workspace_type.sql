ALTER TABLE "campaign_records" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_records" ADD COLUMN "submission_evidence" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workspace_type" text DEFAULT 'organization' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_workspace_type_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_workspace_type_check
      CHECK (workspace_type IN ('personal', 'organization'));
  END IF;
END $$;--> statement-breakpoint
-- Real submission worker access. The campaign worker is a privileged backend
-- (like the outbox worker): it claims queued records across tenants, so its
-- policies use (true) exactly like worker_queue does. User-facing isolation
-- is unchanged — workflow_app policies are untouched.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS worker_campaigns_read ON public.campaigns';
  EXECUTE 'CREATE POLICY worker_campaigns_read ON public.campaigns FOR SELECT TO workflow_worker USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS worker_campaigns_update ON public.campaigns';
  EXECUTE 'CREATE POLICY worker_campaigns_update ON public.campaigns FOR UPDATE TO workflow_worker USING (true) WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS worker_campaign_records_read ON public.campaign_records';
  EXECUTE 'CREATE POLICY worker_campaign_records_read ON public.campaign_records FOR SELECT TO workflow_worker USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS worker_campaign_records_update ON public.campaign_records';
  EXECUTE 'CREATE POLICY worker_campaign_records_update ON public.campaign_records FOR UPDATE TO workflow_worker USING (true) WITH CHECK (true)';
END $$;--> statement-breakpoint
GRANT SELECT, UPDATE ON public.campaigns TO workflow_worker;--> statement-breakpoint
GRANT SELECT, UPDATE ON public.campaign_records TO workflow_worker;--> statement-breakpoint
-- Assertion block: fail loudly on a wrong end-state.
DO $$
DECLARE
  v_col INT;
  v_pol INT;
  v_bypass INT;
BEGIN
  SELECT COUNT(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public'
     AND ((table_name = 'campaign_records' AND column_name IN ('submission_evidence', 'next_attempt_at'))
       OR (table_name = 'organizations' AND column_name = 'workspace_type'));
  IF v_col <> 3 THEN RAISE EXCEPTION '0008 columns missing (found % of 3)', v_col; END IF;
  SELECT COUNT(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND policyname LIKE 'worker_campaign%';
  IF v_pol <> 4 THEN RAISE EXCEPTION '0008 worker campaign policies missing (found % of 4)', v_pol; END IF;
  SELECT COUNT(*) INTO v_bypass FROM pg_roles WHERE rolname LIKE 'workflow_%' AND rolbypassrls;
  IF v_bypass <> 0 THEN RAISE EXCEPTION 'restricted roles must never have BYPASSRLS'; END IF;
END $$;