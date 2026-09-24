-- Add avatar_url column to admin_users for persistent profile avatars.
-- Clerk manages identity; this stores the Cloudinary-hosted avatar chosen
-- by the admin within the Diplomat dashboard.

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS avatar_url text;
