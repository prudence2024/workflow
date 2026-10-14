/** Sanitized runtime facts for attributing worker failures without secrets. */
export function workerEnvironmentSummary(env = process.env) {
  return {
    nodeEnv: env.NODE_ENV === "development" || env.NODE_ENV === "production" ? env.NODE_ENV : "other",
    neonBranch: env.NEON_BRANCH?.toLowerCase() === "development" || env.NEON_BRANCH?.toLowerCase() === "production"
      ? env.NEON_BRANCH.toLowerCase()
      : "other",
    localFormTestEnabled: env.WORKFLOW_ALLOW_LOCAL_FORM_TEST === "1",
    workerDatabaseUrlPresent: Boolean(env.WORKER_DATABASE_URL?.trim()),
    workerOrganizationConfigured: Boolean(env.WORKFLOW_WORKER_ORG_ID?.trim()),
    expectedBranchConfigured: Boolean(env.WORKFLOW_EXPECTED_NEON_BRANCH_ID?.trim()),
    expectedProjectConfigured: Boolean(env.WORKFLOW_EXPECTED_NEON_PROJECT_ID?.trim()),
  };
}

export function workerEvent(event, details = {}) {
  return JSON.stringify({ component: "form-worker", event, ...details });
}
