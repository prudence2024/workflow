import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NGN_PRICES } from "@/lib/pricing";
import { PLANS } from "@/lib/plans";

describe("final onboarding UX boundaries", () => {
  it("uses one NGN pricing source for plan cards", () => {
    expect(NGN_PRICES).toEqual({ free: PLANS.free.priceMonthly, pro: PLANS.pro.priceMonthly, plus: PLANS.plus.priceMonthly });
    expect(NGN_PRICES).toEqual({ free: 0, pro: 31_500, plus: 100_000 });
    const planCard = readFileSync("src/components/pricing/PlanCard.tsx", "utf8");
    const onboarding = readFileSync("src/app/onboarding/page.tsx", "utf8");
    expect(planCard).toContain("whitespace-nowrap");
    expect(onboarding).toContain("xl:grid-cols-3");
  });

  it("keeps plan prices inside narrow desktop and tablet cards", () => {
    const planCard = readFileSync("src/components/pricing/PlanCard.tsx", "utf8");
    expect(planCard).toContain("flex-wrap");
    expect(planCard).toContain("max-w-full");
  });

  it("does not detach the workspace switcher form before its action settles", () => {
    const switcher = readFileSync("src/components/app/OrgSwitcher.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(switcher).toContain("await switchOrgAction(fd);");
    expect(switcher).toContain("setOpen(false);\n                  router.refresh();");
    const formBody = switcher.slice(switcher.indexOf("action={async"), switcher.indexOf("</form>", switcher.indexOf("action={async")));
    expect(formBody).not.toContain("onClick=");
  });

  it("locks campaign mapping and duplicate queueing while work is active", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    const actions = readFileSync("src/app/(app)/campaigns/actions.ts", "utf8");
    expect(page).toContain("disabled={activeRun}");
    expect(page).toContain('"Running…"');
    expect(actions).toContain("A campaign run is already active.");
    expect(actions).toContain("Mapping is locked while this run is active.");
  });

  it("provides a tenant-scoped downloads surface and recognizes common XLSX headings", () => {
    const importPage = readFileSync("src/app/(app)/imports/[id]/page.tsx", "utf8");
    const downloadsPage = readFileSync("src/app/(app)/downloads/page.tsx", "utf8");
    const downloadRoute = readFileSync("src/app/api/downloads/[id]/route.ts", "utf8");
    expect(importPage).toContain('"fullname"');
    expect(downloadsPage).toContain("listDownloads");
    expect(downloadRoute).toContain("getDownload");
    expect(downloadRoute).toContain("readStoredFile");
  });

  it("keeps phone required, unverified, and outside the OTP/provider path", () => {
    const field = readFileSync("src/app/onboarding/InternationalPhoneInput.tsx", "utf8");
    const action = readFileSync("src/app/onboarding/server-actions.ts", "utf8");
    expect(field).toContain('name="phone"');
    expect(field).toContain('name="phoneCountryDialCode"');
    expect(field).toContain("required");
    expect(action).toContain("normalizeInternationalPhone");
    expect(action).not.toContain("TERMII_API_KEY");
    expect(action).not.toContain("prepareVerification");
  });

  it("makes completed progress navigable without making future steps actionable", () => {
    const stepper = readFileSync("src/app/onboarding/OnboardingStepper.tsx", "utf8");
    expect(stepper).toContain("Return to ${label}");
    expect(stepper).toContain("aria-disabled");
    expect(stepper).toContain("completedSteps");
  });

  it("does not activate a paid plan from an unverified payment amount", () => {
    const payments = readFileSync("src/lib/payments.ts", "utf8");
    expect(payments).toContain("input.amount !== NGN_PRICES[input.planKey]");
    expect(payments).toContain('process.env.PAYSTACK_SECRET_KEY');
    expect(payments).toContain("status === \"verified\"");
  });
});
