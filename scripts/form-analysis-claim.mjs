/** Build the analysis-worker claim query without changing its transaction semantics. */
export function buildAnalysisClaimQuery({ campaignId = null, analysisJobId = null, organizationId = null } = {}) {
  if (campaignId && analysisJobId) {
    throw new Error("USE_ONE_ANALYSIS_SELECTOR");
  }

  const values = [];
  const filters = ["j.status = 'queued'", "j.next_attempt_at <= now()"];
  if (campaignId) {
    values.push(campaignId);
    filters.push(`j.campaign_id = $${values.length}::uuid`);
  }
  if (analysisJobId) {
    values.push(analysisJobId);
    filters.push(`j.id = $${values.length}::uuid`);
  }
  if (organizationId) {
    values.push(organizationId);
    filters.push(`j.org_id = $${values.length}::uuid`);
  }

  return {
    text: `select j.id, j.org_id, j.campaign_id, j.form_url, j.attempts, j.max_attempts, o.plan_key
         from public.form_analysis_jobs j
         join public.organizations o on o.id = j.org_id
        where ${filters.join("\n          and ")}
        order by j.created_at
        limit 1
        for update of j skip locked`,
    values,
  };
}
