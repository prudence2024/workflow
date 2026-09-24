import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { organizationInvitations, organizationMembers, users } from "@/db/schema";
import {
  inviteMemberAction,
  removeMemberAction,
  renameOrganizationAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from "@/app/(app)/settings/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label, Select } from "@/components/ui/Field";
import { RoleBadge, StatusPill } from "@/components/ui/Status";
import { SettingsTabs } from "@/components/app/SettingsTabs";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user.id);
  if (!org) redirect("/onboarding");
  const { error } = await searchParams;

  const members = await db
    .select({
      id: organizationMembers.id,
      role: organizationMembers.role,
      userId: users.id,
      name: users.name,
      email: users.email,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.orgId, org.orgId))
    .orderBy(desc(organizationMembers.createdAt));

  const invitations = await db
    .select()
    .from(organizationInvitations)
    .where(and(eq(organizationInvitations.orgId, org.orgId), eq(organizationInvitations.status, "pending")))
    .orderBy(desc(organizationInvitations.createdAt));

  const canManageMembers = can(org.role, "members:manage");
  const canManageOrg = can(org.role, "org:manage");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-[var(--color-ink)]">Settings</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted)]">Organization, members, and roles</p>
      </div>
      <SettingsTabs />

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Organization" description="Basic workspace information" />
        <CardBody>
          <form action={renameOrganizationAction} className="flex flex-wrap items-end gap-3">
            <FieldGroup className="max-w-xs flex-1">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" name="name" defaultValue={org.orgName} disabled={!canManageOrg} required />
            </FieldGroup>
            {canManageOrg && <Button type="submit">Save</Button>}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Members" description={`${members.length} people have access to this workspace`} />
        <CardBody className="p-0">
          <div className="divide-y divide-[var(--color-border)]">
            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{m.name}</p>
                  <p className="text-[12px] text-[var(--color-muted)]">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageMembers && m.role !== "owner" ? (
                    <form action={updateMemberRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="h-8 text-[12.5px]" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </Select>
                    </form>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                  {canManageMembers && m.role !== "owner" && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {canManageMembers && (
        <Card>
          <CardHeader title="Invite a teammate" description="They'll receive an email invitation (or check server logs in development)" />
          <CardBody>
            <form action={inviteMemberAction} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
              <FieldGroup>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="teammate@organization.org" required />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="role">Role</Label>
                <Select id="role" name="role" defaultValue="member">
                  {Object.entries(ROLE_LABELS)
                    .filter(([key]) => key !== "owner")
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </Select>
              </FieldGroup>
              <Button type="submit">Send invite</Button>
            </form>

            {invitations.length > 0 && (
              <div className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--color-ink)]">{inv.email}</p>
                      <p className="text-[11.5px] text-[var(--color-muted)]">
                        Invited as {inv.role} · expires {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status="draft" />
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
