-- 0023 — tenant-scoped weekly product feedback.
CREATE TABLE "product_surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "period_start" date NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "feature_used" text,
  "challenge" text,
  "bug_report" text,
  "requested_feature" text,
  "satisfaction" integer,
  "would_recommend" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_survey_org_user_period_unique" UNIQUE("org_id", "user_id", "period_start"),
  CONSTRAINT "product_survey_status_check" CHECK ("status" in ('submitted','dismissed','remind')),
  CONSTRAINT "product_survey_satisfaction_check" CHECK ("satisfaction" is null or "satisfaction" between 1 and 5)
);
--> statement-breakpoint
CREATE INDEX "product_survey_org_created_idx" ON "product_surveys" USING btree ("org_id", "created_at");
--> statement-breakpoint
ALTER TABLE public.product_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_surveys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.product_surveys
  FOR ALL TO workflow_app
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());
GRANT SELECT, INSERT, UPDATE ON public.product_surveys TO workflow_app;
