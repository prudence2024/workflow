-- ============================================================
-- ADMIN OPERATIONAL NOTIFICATIONS
-- ============================================================
-- Centralized notification system for important business/operational events.
-- Each notification is tied to an event_key for deduplication.

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,          -- dedup key e.g. 'order_paid_<order_id>' or 'low_stock_<product_id>'
  category text NOT NULL,            -- 'payment', 'inventory', 'security', 'email', 'system', etc.
  severity text NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'error', 'critical'
  title text NOT NULL,
  message text,
  target_url text,                   -- admin route to navigate to on click
  permission_key text,               -- required permission to view (NULL = all admins)
  metadata jsonb DEFAULT '{}',       -- safe context data (no secrets)
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz            -- NULL = active, set when resolved/dismissed
);

-- Unique constraint for deduplication: same event_key cannot create duplicate active notifications
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_event_key_unique
  ON public.admin_notifications (event_key)
  WHERE resolved_at IS NULL;

-- Fast queries: newest first, filter by category, permission-based visibility
CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_category_idx
  ON public.admin_notifications (category);

CREATE INDEX IF NOT EXISTS admin_notifications_severity_idx
  ON public.admin_notifications (severity);

-- Per-admin read tracking
CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, notification_id)
);

-- Also track read state for legacy audit-log based security notifications
-- Keep existing audit_log_id based reads for backward compatibility
DO $$
BEGIN
  -- Add notification_id column if it doesn't exist (migration safety)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notification_reads' AND column_name = 'notification_id'
  ) THEN
    ALTER TABLE public.admin_notification_reads
      ADD COLUMN notification_id uuid REFERENCES public.admin_notifications(id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS: only service role access (application uses service-role server-side)
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- Grant access to service role
GRANT ALL ON public.admin_notifications TO service_role;
GRANT ALL ON public.admin_notification_reads TO service_role;

COMMENT ON TABLE public.admin_notifications IS 'Centralized operational notifications for Admin dashboard bell. Deduplicated by event_key.';
COMMENT ON COLUMN public.admin_notifications.event_key IS 'Unique event identifier for deduplication. Format: category_entity_id or category_description.';
COMMENT ON COLUMN public.admin_notifications.permission_key IS 'Minimum permission required to view. NULL = visible to all authenticated admins.';
