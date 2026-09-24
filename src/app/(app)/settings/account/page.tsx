import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { changePasswordAction, updateAccountAction } from "@/app/(app)/settings/actions";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Label } from "@/components/ui/Field";
import { SettingsTabs } from "@/components/app/SettingsTabs";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error, success } = await searchParams;

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
    </div>
  );
}
