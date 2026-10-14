import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("TWA release checker", () => {
  it("is read-only and checks APK identity plus hosted association", () => {
    const source = readFileSync(new URL("../scripts/twa-release-check.mjs", import.meta.url), "utf8");
    expect(source).toContain("aapt");
    expect(source).toContain("apksigner");
    expect(source).toContain("assetlinks.json");
    expect(source).toContain("/app-entry");
    expect(source).not.toContain("gradlew");
    expect(source).not.toMatch(/\badb\s+install\b|\bgradle\s+install\b/);
    expect(source).not.toContain("signingKey");
  });

  it("matches the experimental package, launch path and local certificate association", () => {
    const assetLinks = JSON.parse(
      readFileSync(new URL("../public/.well-known/assetlinks.json", import.meta.url), "utf8"),
    ) as Array<{ target?: { package_name?: string; sha256_cert_fingerprints?: string[] } }>;
    const target = assetLinks.find((entry) => entry.target?.package_name === "com.workflow.twa.experiment");
    expect(target?.target?.sha256_cert_fingerprints).toContain(
      "EF:A7:4C:EC:85:96:40:8E:18:4A:E5:96:36:F6:A6:6A:1B:84:62:09:21:87:5A:B7:58:F0:19:8A:AD:93:F3:99",
    );

    const twaManifest = JSON.parse(
      readFileSync(new URL("../audit/twa-experiment/twa-manifest.json", import.meta.url), "utf8"),
    ) as { packageId?: string; startUrl?: string };
    expect(twaManifest.packageId).toBe("com.workflow.twa.experiment");
    expect(twaManifest.startUrl).toBe("/app-entry");
  });
});
