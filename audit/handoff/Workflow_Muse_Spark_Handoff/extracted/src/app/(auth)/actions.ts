"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { organizationMembers, organizations, subscriptions, users } from "@/db/schema";
import { createSession, destroySession, hashPassword, setCurrentOrgCookie, verifyPassword } from "@/lib/auth";
import { slugify } from "@/lib/validation";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  organization: z.string().min(2, "Enter your organization name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signupAction(formData: FormData) {
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

  let slug = slugify(organization) || "workspace";
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const clash = await db.select().from(organizations).where(eq(organizations.slug, candidate)).limit(1);
    if (clash.length === 0) {
      slug = candidate;
      break;
    }
    attempt += 1;
  }

  const [org] = await db.insert(organizations).values({ name: organization, slug, planKey: "free" }).returning();
  await db.insert(organizationMembers).values({ orgId: org.id, userId: user.id, role: "owner" });
  await db.insert(subscriptions).values({ orgId: org.id, planKey: "free", status: "active" });
  await logActivity({ orgId: org.id, type: "org_created", message: `Workspace "${org.name}" created` });

  await createSession(user.id);
  await setCurrentOrgCookie(org.id);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(formData: FormData) {
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

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect(`/login?error=${encodeURIComponent("Incorrect email or password")}`);
  }

  await createSession(user!.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
