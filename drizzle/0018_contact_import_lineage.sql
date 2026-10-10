CREATE TABLE IF NOT EXISTS "contact_imports" (
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE cascade,
  "import_id" uuid NOT NULL REFERENCES "imports"("id") ON DELETE cascade,
  "source_row" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "contact_imports_pkey" PRIMARY KEY ("contact_id", "import_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_imports_org_import_idx"
  ON "contact_imports" USING btree ("org_id", "import_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_imports_org_contact_idx"
  ON "contact_imports" USING btree ("org_id", "contact_id");
--> statement-breakpoint
ALTER TABLE "contact_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_imports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "contact_imports";
CREATE POLICY "tenant_isolation" ON "contact_imports"
  FOR ALL TO workflow_app
  USING ("org_id" = app.current_org_id())
  WITH CHECK ("org_id" = app.current_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "contact_imports" TO workflow_app;
