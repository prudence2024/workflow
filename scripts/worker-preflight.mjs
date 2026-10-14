import { isAllowedLocalFormRequest } from "./local-form-allowlist.mjs";

export function workerDatabaseUrl(env = process.env) {
  const workerUrl = env.WORKER_DATABASE_URL?.trim();
  if (workerUrl) return workerUrl;
  if (env.NODE_ENV !== "production") {
    throw new Error("WORKER_DATABASE_URL is required for development worker execution");
  }
  return env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim() || null;
}

export function isDevelopmentWorkerRun(env = process.env) {
  return env.NODE_ENV === "development" && env.NEON_BRANCH?.toLowerCase() === "development";
}

export function workerOrganizationId(env = process.env) {
  return env.WORKFLOW_WORKER_ORG_ID?.trim() || null;
}

export function validateWorkerScope({ campaignId, recordId, recover }, env = process.env) {
  if (campaignId && recordId) throw new Error("choose one worker scope: campaign or record");
  if (isDevelopmentWorkerRun(env)) {
    if (!campaignId || recordId) throw new Error("development worker execution requires --campaign and forbids --record");
    if (recover) throw new Error("development worker recovery requires an explicit campaign-scoped implementation");
  }
  if (!campaignId && !recordId && !recover) throw new Error("worker scope is required; use --campaign or --record");
}

export function validateDevelopmentEnvironment(env = process.env) {
  if (env.NODE_ENV === "production") return { mode: "production" };
  if (env.NODE_ENV !== "development") throw new Error("NODE_ENV must be explicitly development or production");
  if (env.WORKFLOW_ALLOW_LOCAL_FORM_TEST !== "1") {
    throw new Error("development local-form testing is disabled");
  }
  if (!env.WORKER_DATABASE_URL?.trim()) {
    throw new Error("WORKER_DATABASE_URL is required for development worker execution");
  }
  if (!workerOrganizationId(env)) {
    throw new Error("WORKFLOW_WORKER_ORG_ID is required for development worker execution");
  }
  if (!env.WORKFLOW_EXPECTED_NEON_BRANCH_ID?.trim()) {
    throw new Error("independent development branch identity is not configured");
  }
  return { mode: "development" };
}

export async function verifyWorkerDatabase(client, env = process.env) {
  const identity = await client.query(`
    select current_user as role,
           current_database() as database,
           nullif(current_setting('neon.branch_id', true), '') as branch_id,
           nullif(current_setting('neon.project_id', true), '') as project_id
  `);
  const row = identity.rows[0] ?? {};
  const role = await client.query(`
    select rolname as role, rolsuper as superuser, rolbypassrls as bypass_rls
      from pg_roles
     where rolname = current_user
  `);
  const roleRow = role.rows[0] ?? {};
  if (row.role !== "workflow_worker" || row.database !== "neondb" || roleRow.superuser || roleRow.bypass_rls) {
    throw new Error("worker database identity is not the restricted development identity");
  }
  if (isDevelopmentWorkerRun(env) && row.branch_id !== env.WORKFLOW_EXPECTED_NEON_BRANCH_ID) {
    throw new Error("worker database branch identity does not match the expected development branch");
  }
  if (env.WORKFLOW_EXPECTED_NEON_PROJECT_ID && row.project_id !== env.WORKFLOW_EXPECTED_NEON_PROJECT_ID) {
    throw new Error("worker database project identity does not match the expected project");
  }
  return { role: row.role, database: row.database, branchVerified: Boolean(row.branch_id) };
}

export async function runWorkerPreflight({ client, campaignId, recordId, recover, env = process.env }) {
  const mode = validateDevelopmentEnvironment(env).mode;
  validateWorkerScope({ campaignId, recordId, recover }, env);
  const identity = await verifyWorkerDatabase(client, env);
  if (campaignId) {
    const result = await client.query(
      `select id, org_id, form_url, status from public.campaigns where id = $1::uuid limit 1`,
      [campaignId],
    );
    const campaign = result.rows[0];
    if (!campaign) throw new Error("campaign scope was not found");
    const expectedOrgId = workerOrganizationId(env);
    if (!expectedOrgId || campaign.org_id !== expectedOrgId) {
      throw new Error("worker campaign organization scope does not match the authorized organization");
    }
    if (mode === "development" && !isAllowedLocalFormRequest(campaign.form_url, "GET", env)) {
      throw new Error("development campaign form URL is not the authorized local test form");
    }
    return { mode, identity, campaignId: campaign.id, organizationId: campaign.org_id, campaignStatus: campaign.status };
  }
  return { mode, identity };
}
