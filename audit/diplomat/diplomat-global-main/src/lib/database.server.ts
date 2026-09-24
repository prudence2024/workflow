import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
export function getDatabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim() || import.meta.env.VITE_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && secretKey ? { url, secretKey } : null;
}
export function createDatabaseClient() {
  const config = getDatabaseConfig();
  if (!config) throw new Error("The server-side Supabase database connection is not configured.");
  return createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
