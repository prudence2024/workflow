export type PlanKey = "free" | "pro" | "business";

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
};

export const PLANS: Record<PlanKey, Plan> = {
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
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceMonthly: 49,
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
  },
  business: {
    key: "business",
    name: "Business",
    priceMonthly: 199,
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
  },
};

export const PLAN_ORDER: PlanKey[] = ["free", "pro", "business"];
