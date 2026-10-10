ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "audience_snapshot_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_audience_snapshots" (
  "snapshot_id" uuid NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE cascade,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_audience_snapshots_pkey" PRIMARY KEY ("snapshot_id", "contact_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_snapshot_org_campaign_idx"
  ON "campaign_audience_snapshots" USING btree ("org_id", "campaign_id", "snapshot_id");
--> statement-breakpoint
ALTER TABLE "campaign_audience_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_audience_snapshots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "campaign_audience_snapshots";
CREATE POLICY "tenant_isolation" ON "campaign_audience_snapshots"
  FOR ALL TO workflow_app
  USING ("org_id" = app.current_org_id())
  WITH CHECK ("org_id" = app.current_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "campaign_audience_snapshots" TO workflow_app;
