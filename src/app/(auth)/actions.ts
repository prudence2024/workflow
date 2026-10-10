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
  signOutCurrentIdentity,
  verifyPassword,
} from "@/lib/auth";
import { eq } from "drizzle-orm";

const signupSchema = z.object({
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
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const name = "Member";

  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    redirect(`/signup?error=${encodeURIComponent("An account with this email already exists")}`);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ name, email: normalizedEmail, passwordHash, emailVerified: true })
    .returning();

  // Establish identity only. Workspace/profile data belongs to onboarding.
  await createSession(user.id);
  redirect("/onboarding?step=workspace");
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
