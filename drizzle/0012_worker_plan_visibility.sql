DROP POLICY IF EXISTS worker_organizations_plan_read ON public.organizations;--> statement-breakpoint
CREATE POLICY worker_organizations_plan_read ON public.organizations FOR SELECT TO workflow_worker USING (true);--> statement-breakpoint
GRANT SELECT ON public.organizations TO workflow_worker;--> statement-breakpoint
DO $$
DECLARE v_policy integer; v_bypass integer;
BEGIN
  SELECT count(*) INTO v_policy FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'worker_organizations_plan_read';
  IF v_policy <> 1 THEN RAISE EXCEPTION 'worker organization plan policy missing'; END IF;
  SELECT count(*) INTO v_bypass FROM pg_roles WHERE rolname IN ('workflow_app','workflow_worker') AND rolbypassrls;
  IF v_bypass <> 0 THEN RAISE EXCEPTION 'restricted roles must never have BYPASSRLS'; END IF;
END $$;