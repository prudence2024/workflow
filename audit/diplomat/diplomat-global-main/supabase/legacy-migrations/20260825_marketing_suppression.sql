-- ============================================================
-- Marketing Suppression & Unsubscribe
-- ============================================================
-- Provides durable unsubscribe suppression that persists across:
-- - customer record updates
-- - CSV re-imports
-- - newsletter re-signups
-- - recipient aggregation
--
-- Email normalization is DB-enforced via trigger:
--   lower(trim(email)) applied on INSERT/UPDATE
--   UNIQUE(email) constraint ensures one record per normalized email
--
-- DO NOT apply automatically. Run manually in Supabase SQL Editor.
-- ============================================================

-- 1. Marketing suppression table — durable unsubscribe records
CREATE TABLE IF NOT EXISTS public.marketing_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'unsubscribed',
  -- 'unsubscribed' | 'hard_bounce' | 'soft_bounce' | 'complaint' |
  -- 'invalid_email' | 'blocked' | 'admin'
  source text,
  -- 'public_unsubscribe' | 'admin_action' | 'brevo_webhook' | 'import'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. DB-enforced email normalization trigger
-- Ensures all inserts/updates store lower(trim(email))
-- Works with Supabase onConflict: "email" because the stored value is normalized
CREATE OR REPLACE FUNCTION public.normalize_marketing_suppression_email()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_suppression_email ON public.marketing_suppression;
CREATE TRIGGER trg_normalize_suppression_email
  BEFORE INSERT OR UPDATE ON public.marketing_suppression
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_marketing_suppression_email();

-- 3. Unique constraint on normalized email
-- After trigger ensures all values are lower(trim()), this is effectively unique per normalized email
-- Compatible with Supabase PostgREST onConflict: "email"
ALTER TABLE public.marketing_suppression
  ADD CONSTRAINT marketing_suppression_email_unique UNIQUE (email);

-- 4. Add unsubscribe_token to customers for secure public unsubscribe links
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();

-- Unique index on token for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unsubscribe_token
  ON public.customers (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

-- 5. Add unsubscribe_token to newsletter_subscribers for the same reason
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON public.newsletter_subscribers (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

-- 5b. Backfill any existing rows with NULL tokens, then enforce NOT NULL
-- Backfill customers
UPDATE public.customers
SET unsubscribe_token = gen_random_uuid()
WHERE unsubscribe_token IS NULL;

ALTER TABLE public.customers
  ALTER COLUMN unsubscribe_token SET NOT NULL;

-- Backfill newsletter subscribers
UPDATE public.newsletter_subscribers
SET unsubscribe_token = gen_random_uuid()
WHERE unsubscribe_token IS NULL;

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN unsubscribe_token SET NOT NULL;

-- 6. Enable RLS — service_role only (server-side access only)
ALTER TABLE public.marketing_suppression ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_marketing_suppression' AND tablename = 'marketing_suppression') THEN
    CREATE POLICY service_role_all_marketing_suppression ON public.marketing_suppression
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Grant minimum required access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_suppression TO service_role;
REVOKE ALL ON public.marketing_suppression FROM anon, authenticated;

-- 7. Add marketing_unsubscribed_at to customers for audit trail
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at timestamptz;

-- 8. Backfill existing suppressed emails to normalized form (safety)
UPDATE public.marketing_suppression SET email = lower(trim(email)) WHERE email != lower(trim(email));
