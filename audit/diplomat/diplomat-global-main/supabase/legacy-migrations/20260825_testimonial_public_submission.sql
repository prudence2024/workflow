-- ============================================================
-- Testimonial Public Submission & Moderation
-- ============================================================
-- Adds fields for public customer testimonial submissions and
-- explicit moderation workflow.
--
-- COLUMNS ADDED:
--   email              — private contact info (NOT displayed publicly)
--   photo_url          — optional Cloudinary photo (delivered with f_auto,q_auto)
--   consent_to_publish — explicit consent to publish name + testimonial
--   moderation_status  — 'pending' | 'approved' | 'rejected' (constrained)
--   moderated_at       — timestamp of last moderation action
--
-- MODERATION WORKFLOW:
--   Public submission  → moderation_status='pending',  active=false
--   Admin approve      → moderation_status='approved', active=true,  moderated_at set
--   Admin reject       → moderation_status='rejected', active=false, moderated_at set
--   Admin-created      → moderation_status='approved', active=true
--
-- LEGACY CONSENT:
--   Existing active testimonials are NOT given consent_to_publish=true
--   because actual explicit consent is unknown for legacy records.
--   They continue to display as before. consent_to_publish is left
--   as the default (false) for legacy rows — the public query
--   filters on moderation_status=approved, not consent_to_publish.
--
-- DO NOT apply automatically. Run manually in Supabase SQL Editor.
-- ============================================================

-- 1. Add new columns
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS consent_to_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

-- 2. Backfill moderation_status for existing records
--    active=true  → approved (existing published testimonials remain visible)
--    active=false → pending  (hidden items are treated as awaiting review)
--    Do NOT set consent_to_publish for legacy records (actual consent unknown)
UPDATE public.testimonials
  SET moderation_status = CASE
    WHEN active = true THEN 'approved'
    ELSE 'pending'
  END
  WHERE moderation_status = 'pending'; -- only update rows that haven't been explicitly set

-- 3. Index for efficient moderation queue queries
CREATE INDEX IF NOT EXISTS idx_testimonials_moderation_status
  ON public.testimonials (moderation_status);

-- 4. Index for efficient public display queries (approved + active)
CREATE INDEX IF NOT EXISTS idx_testimonials_public_display
  ON public.testimonials (active, moderation_status, sort_order)
  WHERE active = true AND moderation_status = 'approved';
