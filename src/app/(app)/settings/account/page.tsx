import { redirect } from "next/navigation";
import { changePasswordAction, deleteAccountAction, updateAccountAction } from "@/app/(app)/settings/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label } from "@/components/ui/Field";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { authMode, getCurrentUser, legacyAuthAllowed } from "@/lib/auth";
import { deletionImpact } from "@/lib/accountDeletion";

// Authenticated page: reads session cookies and tenant context at request time.
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error, success } = await searchParams;
  const clerkManaged = authMode() === "clerk";
  const impact = user.clerkUserId ? await deletionImpact(user.clerkUserId) : null;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Your account</p>
      </div>
      <SettingsTabs />

      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">Password updated successfully.</Alert>}

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <form action={updateAccountAction} className="flex flex-wrap items-end gap-3">
            <FieldGroup className="max-w-xs flex-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" defaultValue={user.name} required />
            </FieldGroup>
            <Button type="submit">Save</Button>
          </form>
          <div className="mt-4">
            <Label>Email</Label>
            <p className="text-[13.5px] text-[var(--color-ink-soft)]">{user.email}</p>
          </div>
        </CardBody>
      </Card>

      {clerkManaged ? (
        <Card>
          <CardHeader title="Password & security" description="Managed by your sign-in provider" />
          <CardBody>
            <p className="text-[13.5px] text-[var(--color-ink-soft)]">
              Workflow does not own your password — sign-in, MFA and session
              security are managed by Clerk. Use your provider&apos;s account
              screen to change credentials.
            </p>
          </CardBody>
        </Card>
      ) : (
        legacyAuthAllowed() && (
          <Card>
            <CardHeader title="Change password" />
            <CardBody>
              <form action={changePasswordAction} className="space-y-4">
                <FieldGroup>
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input id="currentPassword" name="currentPassword" type="password" required />
                </FieldGroup>
                <FieldGroup>
                  <Label htmlFor="newPassword">New password</Label>
                  <Input id="newPassword" name="newPassword" type="password" minLength={8} required />
                </FieldGroup>
                <Button type="submit">Update password</Button>
              </form>
            </CardBody>
          </Card>
        )
      )}

      <Card>
        <CardHeader
          title="Danger zone"
          description="Deleting your account is permanent and distinct from deleting a workspace"
        />
        <CardBody>
          {impact == null || impact.memberships.length === 0 ? (
            <p className="text-[13.5px] text-[var(--color-muted)]">
              No workspace memberships to resolve. Deleting removes your profile and sign-in identity.
            </p>
          ) : (
            <ul className="mb-4 space-y-1.5 text-[13px] text-[var(--color-ink-soft)]">
              {impact.memberships.map((m) => (
                <li key={m.orgId}>
                  <span className="font-medium">{m.orgName}</span>{" "}
                  <span className="text-[var(--color-muted)]">
                    · {m.workspaceType} · {m.role}
                    {m.soleEligible && m.workspaceType === "organization" && " · sole owner — resolve first"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={deleteAccountAction} className="space-y-4">
            {impact != null &&
              impact.memberships
                .filter((m) => m.workspaceType === "personal" && m.soleEligible)
                .map((m) => (
                  <label key={m.orgId} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                    <input type="checkbox" name="deletePersonal" className="mt-1" />
                    <span>
                      Delete my personal workspace <span className="font-medium">{m.orgName}</span> and its data
                      with my account.
                    </span>
                  </label>
                ))}
            {impact != null &&
              impact.memberships
                .filter((m) => m.soleEligible && m.workspaceType === "organization")
                .map((m) => (
                  <label key={m.orgId} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                    <input type="checkbox" name="deleteOrg" value={m.orgId} className="mt-1" />
                    <span>
                      Delete the workspace <span className="font-medium">{m.orgName}</span> and its data with my
                      account (you are its sole owner).
                    </span>
                  </label>
                ))}
            <FieldGroup>
              <Label htmlFor="confirmation">Type DELETE to confirm</Label>
              <Input id="confirmation" name="confirmation" placeholder="DELETE" required autoComplete="off" />
            </FieldGroup>
            <Button type="submit" variant="danger">
              Delete my account
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
