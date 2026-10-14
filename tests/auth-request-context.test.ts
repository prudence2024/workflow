import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("authentication request context safety", () => {
  it("records a sanitized database diagnostic and fails closed on profile upsert errors", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("local profile upsert failure");
    expect(auth).toContain("safeErrorDiagnostic(error)");
    expect(auth).toContain("Local profile provisioning failed");
    expect(auth).not.toContain("console.error(error)");
  });

  it("redirects a campaign action to bounded auth recovery instead of leaving pending UI", () => {
    const actions = read("src/app/(app)/campaigns/actions.ts");
    expect(actions).toContain("authentication context failed");
    expect(actions).toContain("/login?error=auth_unavailable");
  });

  it("uses the framework Script component for pre-hydration theme setup", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import Script from "next/script"');
    expect(layout).toContain('id="workflow-theme"');
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).not.toContain("<script");
  });
});
