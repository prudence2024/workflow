-- 0020 — verified payment records and receipt history foundation
-- Forward-only expansion. No existing migration is edited or rewritten.

CREATE TABLE "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid,
  "provider" text DEFAULT 'paystack' NOT NULL,
  "provider_reference" text NOT NULL,
  "provider_transaction_id" text,
  "idempotency_key" text NOT NULL,
  "plan_key" text NOT NULL,
  "amount" integer NOT NULL,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "payment_method_summary" text,
  "receipt_number" text,
  "paid_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "billing_period_start" timestamp with time zone,
  "billing_period_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade,
  CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "payments_provider_reference_unique" UNIQUE("provider", "provider_reference"),
  CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "payments_receipt_number_unique" UNIQUE("receipt_number"),
  CONSTRAINT "payments_plan_key_check" CHECK ("plan_key" in ('free','pro','plus','business')),
  CONSTRAINT "payments_status_check" CHECK ("status" in ('pending','verified','failed','cancelled','refunded')),
  CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX "payments_org_created_idx" ON "payments" USING btree ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("org_id", "status");
--> statement-breakpoint
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.payments
  FOR SELECT TO workflow_app
  USING (org_id = app.current_org_id());
GRANT SELECT ON public.payments TO workflow_app;
