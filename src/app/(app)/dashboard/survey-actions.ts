"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { recordSurveyInteraction } from "@/lib/surveys";

async function workspace() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");
  return { user, org };
}

const surveySchema = z.object({
  featureUsed: z.string().trim().max(120).optional(),
  challenge: z.string().trim().max(1000).optional(),
  bugReport: z.string().trim().max(1000).optional(),
  requestedFeature: z.string().trim().max(1000).optional(),
  satisfaction: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.coerce.number().int().min(1).max(5).optional(),
  ),
  wouldRecommend: z.enum(["yes", "no"]).optional(),
});

export async function submitSurveyAction(formData: FormData) {
  const current = await workspace();
  const parsed = surveySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/dashboard?survey=error");
  await recordSurveyInteraction({ user: current.user, org: current.org }, {
    status: "submitted",
    ...parsed.data,
    wouldRecommend: parsed.data!.wouldRecommend === "yes" ? true : parsed.data!.wouldRecommend === "no" ? false : null,
  });
  redirect("/dashboard?survey=thanks");
}

export async function dismissSurveyAction() {
  const current = await workspace();
  await recordSurveyInteraction({ user: current.user, org: current.org }, { status: "dismissed" });
  redirect("/dashboard");
}

export async function remindSurveyAction() {
  const current = await workspace();
  await recordSurveyInteraction({ user: current.user, org: current.org }, { status: "remind" });
  redirect("/dashboard");
}
