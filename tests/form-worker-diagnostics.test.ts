import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAllowedLocalFormRequest } from "../scripts/local-form-allowlist.mjs";
import { runWorkerPreflight, validateDevelopmentEnvironment, validateWorkerScope, verifyWorkerDatabase } from "../scripts/worker-preflight.mjs";
import { buildAnalysisClaimQuery } from "../scripts/form-analysis-claim.mjs";
import { safeBrowserError } from "../scripts/form-worker-diagnostics.mjs";
import { workerEnvironmentSummary, workerEvent } from "../scripts/worker-runtime-diagnostics.mjs";
import { claimOne } from "../scripts/form-worker.mjs";

describe("form worker browser diagnostics", () => {
  it("provides a check-only command that never claims or submits records", () => {
    const source = readFileSync(new URL("../scripts/form-worker-check.mjs", import.meta.url), "utf8");
    expect(source).toContain("runWorkerPreflight");
    expect(source).toContain("select status, count(*)");
    expect(source).toContain("chromium.launch");
    expect(source).not.toContain("update public.campaign_records");
    expect(source).not.toContain("page.goto");
    expect(source).not.toContain("formData");
  });

  it("emits only normalized environment facts", () => {
    const summary = workerEnvironmentSummary({
      NODE_ENV: "development",
      NEON_BRANCH: "development",
      WORKFLOW_ALLOW_LOCAL_FORM_TEST: "1",
      WORKER_DATABASE_URL: "postgres://worker:secret@example.test/db",
      WORKFLOW_EXPECTED_NEON_BRANCH_ID: "br-secret",
    });
    expect(summary).toMatchObject({
      nodeEnv: "development",
      neonBranch: "development",
      localFormTestEnabled: true,
      workerDatabaseUrlPresent: true,
      expectedBranchConfigured: true,
      workerOrganizationConfigured: false,
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(workerEvent("preflight_passed", { environment: summary })).not.toContain("postgres://");
  });

  it("preserves the full Chromium launch error instead of its first character", () => {
    const error = [
      "Error: browserType.launch: Executable doesn't exist at /ms-playwright/chromium-1234/chrome-linux64/chrome",
      "Call log:",
      "  - <launching> /ms-playwright/chromium-1234/chrome-linux64/chrome --headless",
      "  - <launched> pid=42",
    ].join("\n");

    const safe = safeBrowserError(error);

    expect(safe).toContain("browserType.launch: Executable doesn't exist");
    expect(safe).toContain("Call log:");
    expect(safe).not.toBe("n");
  });

  it("redacts secrets and PII while retaining the error category", () => {
    const safe = safeBrowserError(
      new Error("browserType.launch failed for owner@example.com authorization: Bearer secret-token"),
    );

    expect(safe).toContain("Error: browserType.launch failed");
    expect(safe).toContain("[redacted-email]");
    expect(safe).toContain("authorization=[redacted]");
    expect(safe).not.toContain("secret-token");
  });
});

describe("campaign-scoped analysis claims", () => {
  it("runs analysis through the restricted worker URL and startup preflight", () => {
    const source = readFileSync("scripts/analyze-form-worker.mjs", "utf8");
    expect(source).toContain("workerDatabaseUrl()");
    expect(source).toContain("runWorkerPreflight");
    expect(source).toContain("campaignId");
  });

  it("requires the supervisor to pass an explicit campaign scope to both workers", () => {
    const source = readFileSync("scripts/form-automation-worker.mjs", "utf8");
    expect(source).toContain("FORM_WORKER_REQUIRES_CAMPAIGN_SCOPE");
    expect(source).not.toContain('["--campaign", campaignId, "--recover"');
    expect(source).toContain('["--campaign", campaignId, "--limit"');
  });

  it("preserves the default queue claim when no selector is supplied", () => {
    const query = buildAnalysisClaimQuery();
    expect(query.values).toEqual([]);
    expect(query.text).toContain("j.status = 'queued'");
    expect(query.text).not.toContain("j.campaign_id =");
    expect(query.text).not.toContain("j.id = $1::uuid");
  });

  it("limits analysis claims to one campaign", () => {
    const query = buildAnalysisClaimQuery({ campaignId: "campaign-id" });
    expect(query.values).toEqual(["campaign-id"]);
    expect(query.text).toContain("j.campaign_id = $1::uuid");
    expect(query.text).not.toContain("j.id =");
  });

  it("binds analysis claims to the authorized organization when supplied", () => {
    const query = buildAnalysisClaimQuery({ campaignId: "campaign-id", organizationId: "org-id" });
    expect(query.values).toEqual(["campaign-id", "org-id"]);
    expect(query.text).toContain("j.campaign_id = $1::uuid");
    expect(query.text).toContain("j.org_id = $2::uuid");
  });

  it("binds submission claims to the authorized organization", async () => {
    const statements: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: async (text: string, params?: unknown[]) => {
        statements.push({ text, params });
        if (text.includes("select r.id")) {
          return { rows: [{ id: "record-id", org_id: "org-id", campaign_id: "campaign-id", contact_id: "contact-id", attempts: 0, form_definition: [], plan_key: "free" }] };
        }
        if (text.includes("select id, form_url")) {
          return { rows: [{ id: "campaign-id", form_url: "https://example.com/form", form_definition: [], field_mapping: {} }] };
        }
        if (text.includes("select id, first_name")) {
          return { rows: [{ id: "contact-id", first_name: "Synthetic", last_name: "Record", email: "synthetic@example.com", phone: "+15555550100", custom_fields: {} }] };
        }
        return { rows: [] };
      },
    };

    const job = await claimOne(client, "campaign-id", "org-id");
    const claim = statements.find((statement) => statement.text.includes("select r.id"));
    expect(job?.rec.org_id).toBe("org-id");
    expect(claim?.text).toContain("r.org_id = $2::uuid");
    expect(claim?.params).toEqual(["campaign-id", "org-id"]);
  });

  it("limits analysis claims to one job and rejects ambiguous selectors", () => {
    const query = buildAnalysisClaimQuery({ analysisJobId: "job-id" });
    expect(query.values).toEqual(["job-id"]);
    expect(query.text).toContain("j.id = $1::uuid");
    expect(() => buildAnalysisClaimQuery({ campaignId: "campaign-id", analysisJobId: "job-id" })).toThrow(
      "USE_ONE_ANALYSIS_SELECTOR",
    );
  });
});

describe("submission worker startup preflight", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    NEON_BRANCH: "development",
    WORKFLOW_ALLOW_LOCAL_FORM_TEST: "1",
    WORKFLOW_EXPECTED_NEON_BRANCH_ID: "br-development",
    WORKFLOW_WORKER_ORG_ID: "org-development",
    WORKER_DATABASE_URL: "redacted-development-worker-url",
  };

  it("fails closed when a development flag is missing", () => {
    const { NODE_ENV: _ignoredNodeEnv, ...missingNodeEnv } = env;
    void _ignoredNodeEnv;
    expect(() => validateDevelopmentEnvironment(missingNodeEnv as NodeJS.ProcessEnv)).toThrow("NODE_ENV");
    expect(() => validateDevelopmentEnvironment({ ...env, WORKFLOW_ALLOW_LOCAL_FORM_TEST: "0" })).toThrow("local-form testing is disabled");
    expect(() => validateDevelopmentEnvironment({ ...env, WORKFLOW_EXPECTED_NEON_BRANCH_ID: "" })).toThrow("branch identity");
    expect(() => validateDevelopmentEnvironment({ ...env, WORKFLOW_WORKER_ORG_ID: "" })).toThrow("WORKFLOW_WORKER_ORG_ID");
  });

  it("requires an explicit campaign scope for development execution", () => {
    expect(() => validateWorkerScope({ campaignId: null, recordId: null, recover: false }, env)).toThrow("requires --campaign");
    expect(() => validateWorkerScope({ campaignId: "c", recordId: "r", recover: false }, env)).toThrow("choose one");
    expect(() => validateWorkerScope({ campaignId: null, recordId: null, recover: true }, env)).toThrow("requires --campaign");
  });

  it("uses the exact local form allowlist and rejects wrong paths", () => {
    expect(isAllowedLocalFormRequest("http://localhost:3000/testing-form", "GET", env)).toBe(true);
    expect(isAllowedLocalFormRequest("http://localhost:3000/other", "GET", env)).toBe(false);
    expect(isAllowedLocalFormRequest("http://localhost:3001/testing-form", "GET", env)).toBe(false);
  });

  it("normalizes trailing-dot hostnames before worker SSRF checks", () => {
    const source = readFileSync("scripts/form-worker.mjs", "utf8");
    expect(source).toContain('u.hostname.toLowerCase().replace(/\\.+$/, "")');
  });

  it("rejects a wrong database role or RLS posture", async () => {
    const client = { query: async (text: string) => text.includes("current_user")
      ? { rows: [{ role: "neondb_owner", database: "neondb", branch_id: "br-development" }] }
      : { rows: [{ role: "neondb_owner", superuser: false, bypass_rls: true }] } };
    await expect(verifyWorkerDatabase(client, env)).rejects.toThrow("restricted development identity");
  });

  it("rejects a connection whose observed branch differs from the expected branch", async () => {
    const client = { query: async (text: string) => text.includes("current_user")
      ? { rows: [{ role: "workflow_worker", database: "neondb", branch_id: "br-production" }] }
      : { rows: [{ role: "workflow_worker", superuser: false, bypass_rls: false }] } };
    await expect(verifyWorkerDatabase(client, env)).rejects.toThrow("branch identity");
  });

  it("passes only for the verified role, branch and authorized campaign URL", async () => {
    const client = { query: async (text: string) => {
      if (text.includes("current_user")) return { rows: [{ role: "workflow_worker", database: "neondb", branch_id: "br-development", project_id: null }] };
      if (text.includes("pg_roles")) return { rows: [{ role: "workflow_worker", superuser: false, bypass_rls: false }] };
      return { rows: [{ id: "campaign-id", org_id: "org-development", form_url: "http://localhost:3000/testing-form", status: "running" }] };
    } };
    await expect(runWorkerPreflight({ client, campaignId: "campaign-id", recordId: null, recover: false, env })).resolves.toMatchObject({ campaignId: "campaign-id", mode: "development" });
  });

  it("rejects an incorrectly scoped campaign URL before any claim path", async () => {
    const client = { query: async (text: string) => {
      if (text.includes("current_user")) return { rows: [{ role: "workflow_worker", database: "neondb", branch_id: "br-development", project_id: null }] };
      if (text.includes("pg_roles")) return { rows: [{ role: "workflow_worker", superuser: false, bypass_rls: false }] };
      return { rows: [{ id: "campaign-id", org_id: "org-development", form_url: "http://localhost:3000/other", status: "running" }] };
    } };
    await expect(runWorkerPreflight({ client, campaignId: "campaign-id", recordId: null, recover: false, env })).rejects.toThrow("authorized local test form");
  });

  it("rejects a campaign from another organization before claim", async () => {
    const client = { query: async (text: string) => {
      if (text.includes("current_user")) return { rows: [{ role: "workflow_worker", database: "neondb", branch_id: "br-development", project_id: null }] };
      if (text.includes("pg_roles")) return { rows: [{ role: "workflow_worker", superuser: false, bypass_rls: false }] };
      return { rows: [{ id: "campaign-id", org_id: "other-org", form_url: "http://localhost:3000/testing-form", status: "running" }] };
    } };
    await expect(runWorkerPreflight({ client, campaignId: "campaign-id", recordId: null, recover: false, env })).rejects.toThrow("organization scope");
  });

  it("reports stale recovery as needs_attention rather than queued", () => {
    const source = readFileSync("scripts/form-worker.mjs", "utf8");
    expect(source).toContain("parked");
    expect(source).toContain("needs_attention for review");
    expect(source).not.toContain("recovered ${res.rowCount} stale processing row(s) to queued.");
  });
});
