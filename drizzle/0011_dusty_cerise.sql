DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_key_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_plan_key_check
      CHECK (plan_key IN ('free','pro','plus','business'));
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_key_check;--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_key_check CHECK (plan_key IN ('free','pro','plus','business'));--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_requested_plan_key_check;--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_requested_plan_key_check CHECK (requested_plan_key IS NULL OR requested_plan_key IN ('free','pro','plus','business'));--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_state_check;--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_state_check CHECK (billing_state IN ('active','pending_payment','past_due','cancelled'));--> statement-breakpoint
DO $$
DECLARE
  v_bypass integer;
BEGIN
  SELECT count(*) INTO v_bypass FROM pg_roles WHERE rolname IN ('workflow_app','workflow_worker') AND rolbypassrls;
  IF v_bypass <> 0 THEN RAISE EXCEPTION 'restricted roles must never have BYPASSRLS'; END IF;
END $$;