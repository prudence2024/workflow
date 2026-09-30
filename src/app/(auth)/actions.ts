"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  getCurrentUser,
  hashPassword,
  legacyAuthAllowed,
  setCurrentOrgCookie,
  signOutCurrentIdentity,
  verifyPassword,
} from "@/lib/auth";
import { createOrganizationForIdentity } from "@/lib/tenant";
import { slugify } from "@/lib/validation";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  organization: z.string().min(2, "Enter your organization name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Password signup is the transitional bridge and only exists outside
 * production. In production this action refuses outright — there is no silent
 * downgrade from Clerk to local passwords.
 */
export async function signupAction(formData: FormData) {
  if (!legacyAuthAllowed()) {
    redirect(
      `/signup?error=${encodeURIComponent(
        "Password sign-up is unavailable. Configure Clerk to enable account creation.",
      )}`,
    );
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    organization: formData.get("organization"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { name, organization, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    redirect(`/signup?error=${encodeURIComponent("An account with this email already exists")}`);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ name, email: normalizedEmail, passwordHash, emailVerified: true })
    .returning();

  // Establish the session first, then let the database provision the workspace
  // through the same permission-checked function the rest of the app uses.
  const sessionToken = await createSession(user.id);
  const slug = slugify(organization) || "workspace";
  const orgId = await createOrganizationForIdentity({ kind: "legacy", sessionToken }, organization, slug);
  await logActivity({ orgId, type: "org_created", message: `Workspace "${organization}" created` });
  await setCurrentOrgCookie(orgId);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(formData: FormData) {
  if (!legacyAuthAllowed()) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Password sign-in is unavailable. Configure Clerk to enable authentication.",
      )}`,
    );
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  const user = rows[0];

  // Legacy password sign-in only works for rows that still carry a hash.
  // Once identity moves to Clerk, accounts without a hash cannot use this
  // form at all — they must sign in through the Clerk flow.
  const legacyHash = user?.passwordHash;
  if (!user || !legacyHash || !(await verifyPassword(password, legacyHash))) {
    redirect(`/login?error=${encodeURIComponent("Incorrect email or password")}`);
  }

  await createSession(user!.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  // Revokes the Clerk session when one exists, then clears local cookies.
  const user = await getCurrentUser().catch(() => null);
  await signOutCurrentIdentity(user);
  redirect("/login");
}
