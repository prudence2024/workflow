-- ============================================================
-- Add secure download_token to receipts for public access
-- without exposing payment references as authorization.
--
-- Security: token is high-entropy UUID, not guessable.
-- Server endpoint queries by token using service-role client.
-- ============================================================

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS download_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS receipts_download_token_idx
  ON public.receipts (download_token);
