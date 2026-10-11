import { z } from "zod";

export const selectablePlanKeySchema = z.enum(["free", "pro", "plus"]);
export type SelectablePlanKey = z.infer<typeof selectablePlanKeySchema>;
export type LegacyPlanKey = SelectablePlanKey | "business";
/** Internal database/runtime plan type. Customer selection must use SelectablePlanKey. */
export type PlanKey = LegacyPlanKey;

export type PlanCapability =
  | "single_page_forms"
  | "basic_form_mapping"
  | "multi_page_forms"
  | "conditional_forms"
  | "ai_form_mapping"
  | "ai_failure_analysis"
  | "ai_campaign_builder"
  | "ai_operations_chat"
  | "ai_voice"
  | "ai_data_quality"
  | "ai_automation_builder"
  | "ai_document_intelligence"
  | "custom_fields"
  | "api_access";

export type PlanLimits = {
  contacts: number;
  submissionsPerMonth: number;
  activeCampaigns: number;
  users: number;
  storageMb: number;
};

export type Plan = {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  tagline: string;
  limits: PlanLimits;
  features: string[];
  capabilities: readonly PlanCapability[];
  aiLimits: { requests: number; voiceSeconds: number };
};

const FREE_CAPABILITIES: readonly PlanCapability[] = ["single_page_forms", "basic_form_mapping"];
const PRO_CAPABILITIES: readonly PlanCapability[] = [
  ...FREE_CAPABILITIES,
  "multi_page_forms",
  "conditional_forms",
  "ai_form_mapping",
  "ai_failure_analysis",
  "ai_campaign_builder",
  "ai_operations_chat",
  "custom_fields",
];
const PLUS_CAPABILITIES: readonly PlanCapability[] = [
  ...PRO_CAPABILITIES,
  "ai_voice",
  "ai_data_quality",
  "ai_automation_builder",
  "ai_document_intelligence",
  "api_access",
];

export const PLANS: Record<LegacyPlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Get organized before you scale.",
    limits: { contacts: 250, submissionsPerMonth: 100, activeCampaigns: 1, users: 1, storageMb: 100 },
    features: [
      "1 workspace, 1 user",
      "Up to 250 contacts",
      "100 submissions / month",
      "1 active campaign",
      "XLSX / CSV imports",
      "Manual field mapping",
      "Activity timeline",
      "Basic email sending",
      "CSV / XLSX exports",
    ],
    capabilities: FREE_CAPABILITIES,
    aiLimits: { requests: 10, voiceSeconds: 0 },
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceMonthly: 31_500,
    tagline: "For growing teams running real operations.",
    limits: { contacts: 10000, submissionsPerMonth: 5000, activeCampaigns: 10, users: 10, storageMb: 5000 },
    features: [
      "Everything in Free",
      "Up to 10 team members",
      "10,000 contacts",
      "5,000 submissions / month",
      "Scheduled reminders",
      "Advanced reports & scheduled exports",
      "Priority processing",
      "API access & webhooks (soon)",
    ],
    capabilities: PRO_CAPABILITIES,
    aiLimits: { requests: 250, voiceSeconds: 900 },
  },
  plus: {
    key: "plus",
    name: "Plus",
    priceMonthly: 100_000,
    tagline: "Advanced controls for larger organizations.",
    limits: { contacts: 100000, submissionsPerMonth: 50000, activeCampaigns: 50, users: 50, storageMb: 50000 },
    features: [
      "Everything in Pro",
      "Advanced RBAC & audit logs",
      "Custom branding",
      "Priority support",
      "Longer data retention",
      "Enterprise exports",
    ],
    capabilities: PLUS_CAPABILITIES,
    aiLimits: { requests: 2000, voiceSeconds: 7200 },
  },
  // Backward-compatible database/UI alias. Existing Business subscriptions
  // receive every Plus entitlement without requiring a data rewrite.
  business: {
    key: "business",
    name: "Plus",
    priceMonthly: 100_000,
    tagline: "Advanced controls for larger organizations.",
    limits: { contacts: 100000, submissionsPerMonth: 50000, activeCampaigns: 50, users: 50, storageMb: 50000 },
    features: ["Every Plus capability"],
    capabilities: PLUS_CAPABILITIES,
    aiLimits: { requests: 2000, voiceSeconds: 7200 },
  },
};

export const PLAN_ORDER: SelectablePlanKey[] = ["free", "pro", "plus"];

export function parsePlanKey(value: unknown): PlanKey {
  return value === "pro" || value === "plus" || value === "business" ? value : "free";
}

export function isSelectablePlanKey(value: unknown): value is SelectablePlanKey {
  return value === "free" || value === "pro" || value === "plus";
}

export function isLegacyPlanKey(value: unknown): value is LegacyPlanKey {
  return isSelectablePlanKey(value) || value === "business";
}

export function parseSelectablePlanKey(value: unknown): SelectablePlanKey {
  return isSelectablePlanKey(value) ? value : "free";
}

export function canonicalPlanKey(value: unknown): SelectablePlanKey {
  return value === "pro" ? "pro" : value === "plus" || value === "business" ? "plus" : "free";
}

export function hasCapability(plan: unknown, capability: PlanCapability): boolean {
  return PLANS[parsePlanKey(plan)].capabilities.includes(capability);
}

export function capabilityMessage(capability: PlanCapability): string {
  const labels: Record<PlanCapability, string> = {
    single_page_forms: "Single-page forms are available on every plan.",
    basic_form_mapping: "Basic form mapping is available on every plan.",
    multi_page_forms: "Multi-page forms are available on Pro and Plus.",
    conditional_forms: "Conditional forms are available on Pro and Plus.",
    ai_form_mapping: "AI form mapping is available on Pro and Plus.",
    ai_failure_analysis: "AI failure analysis is available on Pro and Plus.",
    ai_campaign_builder: "The AI campaign assistant is available on Pro and Plus.",
    ai_operations_chat: "Workflow AI Operations Chat is available on Pro and Plus.",
    ai_voice: "Workflow AI Voice is available on Pro and Plus.",
    ai_data_quality: "AI data-quality assistance is available on Plus.",
    ai_automation_builder: "AI automation building is reserved for Plus.",
    ai_document_intelligence: "AI document intelligence is reserved for Plus.",
    custom_fields: "Custom fields are available on Pro and Plus.",
    api_access: "API access is available on Plus.",
  };
  return labels[capability];
}
