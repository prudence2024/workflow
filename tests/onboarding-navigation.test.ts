import { describe, expect, it } from "vitest";
import { resolveOnboardingStep } from "../src/lib/onboardingNavigation";

const fresh = {stage:"workspace",plan:null,workspaceType:null,workspaceId:null,phone:null};
describe("persisted onboarding navigation", () => {
  it("does not permit a URL to skip required state", () => {
    expect(resolveOnboardingStep("details",fresh)).toBe("workspace");
    expect(resolveOnboardingStep("plan",fresh)).toBe("workspace");
  });
  it("resumes workspace and details on reload without query parameters", () => {
    expect(resolveOnboardingStep(undefined,{...fresh,stage:"workspace"})).toBe("workspace");
    expect(resolveOnboardingStep(undefined,{...fresh,stage:"details",workspaceType:"personal",phone:"+2348012345678"})).toBe("plan");
  });
  it("resumes pending payment only with a finalized workspace and paid intent", () => {
    expect(resolveOnboardingStep(undefined,{...fresh,stage:"payment",plan:"pro",workspaceId:"fixture"})).toBe("billing");
    expect(resolveOnboardingStep("billing",{...fresh,stage:"payment",plan:"free",workspaceId:"fixture"})).toBe("workspace");
  });
  it("allows deliberate backwards navigation", () => {
    expect(resolveOnboardingStep("details",{...fresh,stage:"details",workspaceType:"organization"})).toBe("details");
    expect(resolveOnboardingStep("plan",{...fresh,stage:"details",workspaceType:"organization",phone:"+2348012345678"})).toBe("plan");
  });
  it("recovers partial states deterministically", () => {
    expect(resolveOnboardingStep(undefined, {...fresh, stage: "details", workspaceType: "personal"})).toBe("details");
    expect(resolveOnboardingStep(undefined, {...fresh, stage: "plan", workspaceType: "personal", phone: "+2348012345678"})).toBe("plan");
    expect(resolveOnboardingStep(undefined, {...fresh, stage: "workspace", workspaceType: "organization", phone: null})).toBe("workspace");
  });
  it("does not treat an incomplete paid state as billing", () => {
    expect(resolveOnboardingStep(undefined, {...fresh, stage: "payment", plan: "pro", workspaceId: null})).toBe("workspace");
  });
});
