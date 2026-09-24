import { UserButton, useClerk } from "@clerk/tanstack-react-start";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AdminAuthShell } from "@/components/admin-auth-shell";
import { checkIsInitialAdmin, claimOwnerAccess } from "@/lib/admin-authorization.server";

/**
 * Accept ?claim=1 as either string "1" or number 1.
 * TanStack Router parses ?claim=1 as number 1, so we coerce.
 * Only the exact value "1"/1 enables claim mode; all others are ignored.
 * The claim UI also auto-shows if the current user is the INITIAL_ADMIN.
 */
const searchSchema = z.object({
  claim: z.preprocess(
    (val) => (val === "1" || val === 1 ? "1" : undefined),
    z.enum(["1"]).optional(),
  ),
});

export const Route = createFileRoute("/admin/unauthorized")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Access denied — Diplomat Global" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Unauthorized,
});

function Unauthorized() {
  const { claim: claimParam } = Route.useSearch();
  const navigate = useNavigate();
  const claimAccess = useServerFn(claimOwnerAccess);
  const checkAdmin = useServerFn(checkIsInitialAdmin);
  const { signOut } = useClerk();
  const [autoClaim, setAutoClaim] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "busy" | "error"; message: string }>({
    type: "idle",
    message: "",
  });

  // Auto-detect: if the current user is the INITIAL_ADMIN, show claim flow
  useEffect(() => {
    if (claimParam) {
      setAutoClaim(true);
      return;
    }
    checkAdmin()
      .then((res) => setAutoClaim(res.isInitialAdmin))
      .catch(() => setAutoClaim(false));
  }, [claimParam]);

  const showClaim = claimParam || autoClaim === true;

  const handleClaim = async () => {
    if (status.type === "busy") return;
    setStatus({ type: "busy", message: "" });
    const result = await claimAccess();
    if (result.ok) {
      await navigate({ to: "/admin" });
      return;
    }
    setStatus({ type: "error", message: result.message });
  };

  // The claim flow is shown when ?claim=1 is in the URL OR when the current
  // user is the INITIAL_ADMIN_CLERK_USER_ID (auto-detected server-side).
  // claimOwnerAccess server-side validates that:
  // 1. The user matches INITIAL_ADMIN_CLERK_USER_ID
  // 2. Either no admin exists or the existing row has role_id = NULL (repair)
  // Any other user sees the generic access-denied message.
  return (
    <AdminAuthShell
      eyebrow="Access denied"
      title={showClaim ? "Set up your admin account" : "Administrator access required"}
      description={
        showClaim
          ? "No admin account exists yet. If you are the authorized initial administrator, you can claim owner access to the dashboard."
          : "Your account does not have administrator access."
      }
    >
      {!showClaim && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-xl bg-surface p-4 ring-1 ring-border">
            <UserButton />
            <p className="text-sm text-muted-foreground">Signed in as the account shown above.</p>
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold transition hover:border-brand hover:text-brand"
            >
              Return to storefront
            </a>
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: "/admin/login" })}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold transition hover:border-brand hover:text-brand"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
      {showClaim && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl bg-surface p-4 ring-1 ring-border">
            <UserButton />
            <p className="text-sm text-muted-foreground">
              Continue as the account shown above to set up admin access.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClaim}
            disabled={status.type === "busy"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-inverse px-6 text-sm font-semibold text-inverse-foreground transition hover:bg-brand hover:text-brand-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {status.type === "busy" ? "Setting up…" : "Claim owner access"}
          </button>
          {status.type === "error" && (
            <p className="mt-3 text-sm text-destructive" role="status">
              {status.message}
            </p>
          )}
        </div>
      )}
    </AdminAuthShell>
  );
}
