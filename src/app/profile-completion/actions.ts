"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  next: z.string().optional(),
});

function safeInternalNext(value: string | undefined): string {
  if (!value) return "/onboarding?step=workspace";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    // Fall through to onboarding.
  }
  return "/onboarding?step=workspace";
}

export async function completeProfileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    redirect(`/profile-completion?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Enter your name")}`);
  }

  const firstName = parsed.data.firstName.trim();
  const lastName = parsed.data.lastName.trim();
  const fullName = `${firstName} ${lastName}`;

  // Clerk remains the identity source of truth. The local profile is updated
  // only after Clerk accepts the required identity fields.
  let clerkSaveFailed = false;
  if (user.clerkUserId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.users.updateUser(user.clerkUserId, { firstName, lastName });
    } catch {
      clerkSaveFailed = true;
    }
  }

  if (clerkSaveFailed) redirect(`/profile-completion?error=${encodeURIComponent("We could not save your name yet. Please try again.")}`);

  await db.update(users).set({ name: fullName }).where(eq(users.id, user.id));
  redirect(safeInternalNext(parsed.data.next));
}
