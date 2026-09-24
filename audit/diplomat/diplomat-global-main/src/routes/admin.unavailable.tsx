import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AdminAuthShell } from "@/components/admin-auth-shell";

const searchSchema = z.object({
  reason: z.enum(["setup", "unconfigured", "unavailable", "network"]).optional(),
});

const SETUP_SQL = `create extension if not exists pgcrypto;
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique check (length(clerk_user_id) between 8 and 255),
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor', 'support')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_users_active_role_idx on public.admin_users(active, role);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;`;

export const Route = createFileRoute("/admin/unavailable")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Admin setup required — Diplomat Global" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Unavailable,
});
function Unavailable() {
  const { reason } = Route.useSearch();
  const [copied, setCopied] = useState(false);
  const isSetup = reason === "setup";
  const isNetwork = reason === "network";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <AdminAuthShell
      eyebrow={
        isSetup
          ? "Database setup required"
          : isNetwork
            ? "Connection problem"
            : "Configuration required"
      }
      title={
        isSetup
          ? "Finish the admin database setup"
          : isNetwork
            ? "We couldn't reach the admin service"
            : "The admin service is unavailable"
      }
      description={
        isSetup
          ? "Clerk is connected, but the administrator directory table is missing from your Supabase project. Run the SQL below once, then sign in again."
          : isNetwork
            ? "The connection to the sign-in service was interrupted. This is usually temporary — check your connection and try again."
            : "Clerk or the server-side database connection has not been configured, or the authorization lookup could not complete."
      }
    >
      {isSetup ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Open your Supabase project → SQL editor.</li>
            <li>Paste and run the statement below.</li>
            <li>Return here and sign in — the first account becomes the owner.</li>
          </ol>
          <pre className="max-h-64 overflow-auto rounded-xl bg-ink p-4 text-xs leading-5 text-canvas ring-1 ring-border">
            <code>{SETUP_SQL}</code>
          </pre>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center rounded-xl bg-inverse px-5 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground"
          >
            {copied ? "Copied to clipboard ✓" : "Copy SQL"}
          </button>
          <div className="flex gap-3 pt-1">
            <a
              href="/admin/login"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold"
            >
              Sign in
            </a>
            <Link
              to="/"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold"
            >
              Return to storefront
            </Link>
          </div>
        </div>
      ) : isNetwork ? (
        <a
          href="/dashboard"
          className="inline-flex min-h-12 items-center rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
        >
          Try again
        </a>
      ) : (
        <Link
          to="/"
          className="inline-flex min-h-12 items-center rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground"
        >
          Return to storefront
        </Link>
      )}
    </AdminAuthShell>
  );
}
