-- Run this in the Supabase Dashboard SQL Editor to fix service_role permissions
-- https://supabase.com/dashboard/project/urorrrmyzsuwulfljvwm/sql/new

DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
END $$;

-- Also grant usage on sequences for identity columns
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Create exec_sql helper for future migrations
CREATE OR REPLACE FUNCTION public.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END $$;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
