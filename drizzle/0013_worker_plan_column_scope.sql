REVOKE ALL ON public.organizations FROM workflow_worker;--> statement-breakpoint
GRANT SELECT (id, plan_key) ON public.organizations TO workflow_worker;--> statement-breakpoint
DO $$
DECLARE v_bypass integer;
BEGIN
  SELECT count(*) INTO v_bypass FROM pg_roles WHERE rolname IN ('workflow_app','workflow_worker') AND rolbypassrls;
  IF v_bypass <> 0 THEN RAISE EXCEPTION 'restricted roles must never have BYPASSRLS'; END IF;
END $$;