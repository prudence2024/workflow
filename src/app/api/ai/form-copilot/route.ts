import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { type Workspace } from "@/lib/data";
import { AiQuotaError, PlanCapabilityError, PlanLimitError } from "@/lib/planLimits";
import { requireAiCapability, reserveAiRequest } from "@/lib/ai/context";
import { executeAiTool } from "@/lib/ai/tools";
import { suggestFormMappings } from "@/lib/ai/tasks/formMapping";
import { formCopilotSchema } from "@/lib/ai/schemas";
import { recordAiUsage } from "@/lib/ai/usage";
import { canonicalPlanKey } from "@/lib/plans";

export const dynamic = "force-dynamic";
const requestSchema = z.object({ campaignId: z.string().uuid() });

async function workspaceOrNull(): Promise<Workspace | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const orgs = await getUserOrganizations(user);
  const org = orgs.length ? await getCurrentOrg(user) : null;
  return org ? { user, org } : null;
}

function localCopilot(data: Record<string, unknown>) {
  const fields = Array.isArray(data.fields) ? data.fields as Array<{ label?: string; required?: boolean; type?: string }> : [];
  const mapped = Number(data.mapped ?? 0);
  const required = fields.filter((field) => field.required).map((field) => field.label ?? "Unnamed field");
  const suggestions = fields.flatMap((field) => {
    const label = String(field.label ?? "").toLowerCase();
    const contactField = label.includes("email") ? "email" : label.match(/phone|mobile|tel/) ? "phone" : label.includes("full name") ? "firstName" : label.includes("first") && label.includes("name") ? "firstName" : label.includes("last") && label.includes("name") ? "lastName" : null;
    return contactField ? [{ formField: field.label ?? "", contactField, confidence: contactField === "email" || contactField === "phone" ? 0.98 : 0.82, reasoning: "Matched a supported contact field by semantic label." }] : [];
  });
  const unresolved = required.filter((label) => !suggestions.some((suggestion) => suggestion.formField === label));
  const total = fields.length;
  const readiness = total ? Math.max(0, Math.round(((mapped + suggestions.length - unresolved.length) / total) * 100)) : 0;
  return formCopilotSchema.parse({ summary: `${total} questions detected; ${mapped + suggestions.length} have a supported mapping signal.`, purpose: "Authorized operational form", suggestions, unmappedRequired: unresolved, warnings: data.error ? [String(data.error)] : [], readiness });
}

export async function POST(request: NextRequest) {
  const workspace = await workspaceOrNull();
  if (!workspace) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid campaign is required." }, { status: 400 });
  try {
    await requireAiCapability(workspace, "ai_form_mapping");
    await reserveAiRequest(workspace);
    const data = await executeAiTool(workspace, "get_form_structure", { campaignId: parsed.data.campaignId });
    if (!process.env.NVIDIA_API_KEY) return Response.json({ result: localCopilot(data), provider: "local-safe-fallback" });
    const started = Date.now();
    const result = await suggestFormMappings((data.fields ?? []) as never[], { task: "form_mapping", plan: canonicalPlanKey(workspace.org.planKey), requiredCapabilities: ["fast"], latencyPreference: "low" });
    await recordAiUsage(workspace, { task: "form_mapping", provider: "nvidia", model: process.env.AI_MODEL_FAST ?? "openai/gpt-oss-20b", latencyMs: Date.now() - started, outcome: "success" });
    return Response.json({ result, provider: "nvidia" });
  } catch (error) {
    if (error instanceof PlanCapabilityError || error instanceof PlanLimitError || error instanceof AiQuotaError) return Response.json({ error: error.message, upgradeRequired: true }, { status: 402 });
    return Response.json({ error: "Workflow AI could not analyze this form. No mapping was changed." }, { status: 503 });
  }
}