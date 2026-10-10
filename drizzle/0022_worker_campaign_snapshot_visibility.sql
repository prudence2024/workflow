-- 0022 — let the restricted submission worker read immutable audience snapshots.
-- The worker only needs SELECT; tenant writes remain owned by workflow_app.
GRANT SELECT ON public.campaign_audience_snapshots TO workflow_worker;
DROP POLICY IF EXISTS worker_campaign_audience_snapshots_read ON public.campaign_audience_snapshots;
CREATE POLICY worker_campaign_audience_snapshots_read
  ON public.campaign_audience_snapshots
  FOR SELECT TO workflow_worker
  USING (true);
