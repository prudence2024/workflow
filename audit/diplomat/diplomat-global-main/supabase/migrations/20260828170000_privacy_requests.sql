-- Privacy Requests (Nigeria Data Protection Act 2023 / NDPC)
-- Owner-controlled workflow for customer data erasure/anonymization

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'reviewing', 'approved', 'rejected', 'completed')),
  request_type TEXT NOT NULL DEFAULT 'erasure' CHECK (request_type IN ('erasure', 'access', 'correction', 'portability')),
  reason TEXT,
  reviewer_id UUID,
  reviewer_notes TEXT,
  decision_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retained_records JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_customer ON public.privacy_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON public.privacy_requests(status);

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

-- Service role only (admin operations)
CREATE POLICY "Service role manages privacy requests" ON public.privacy_requests
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.privacy_requests IS 'Owner-controlled privacy data erasure requests per Nigeria Data Protection Act 2023';
