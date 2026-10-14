import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const twaManifest = JSON.parse(readFileSync("audit/twa-experiment/twa-manifest.json", "utf8")) as {
  packageId: string;
  startUrl: string;
};
const twaGradle = readFileSync("audit/twa-experiment/app/build.gradle", "utf8");
const bundledManifest = JSON.parse(readFileSync("audit/twa-experiment/app/src/main/res/raw/web_app_manifest.json", "utf8")) as {
  start_url: string;
};
const assetLinks = JSON.parse(readFileSync("public/.well-known/assetlinks.json", "utf8")) as Array<{
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
}>;

describe("isolated TWA app entry", () => {
  it("points only the experimental TWA at the application-owned entry route", () => {
    expect(twaManifest.packageId).toBe("com.workflow.twa.experiment");
    expect(twaManifest.startUrl).toBe("/app-entry");
    expect(twaGradle).toContain("launchUrl: '/app-entry'");
    expect(bundledManifest.start_url).toBe("/app-entry");
  });

  it("prepares Digital Asset Links for the exact experimental signing identity", () => {
    expect(assetLinks).toHaveLength(1);
    expect(assetLinks[0].relation).toContain("delegate_permission/common.handle_all_urls");
    expect(assetLinks[0].target.namespace).toBe("android_app");
    expect(assetLinks[0].target.package_name).toBe("com.workflow.twa.experiment");
    expect(assetLinks[0].target.sha256_cert_fingerprints).toEqual([
      "EF:A7:4C:EC:85:96:40:8E:18:4A:E5:96:36:F6:A6:6A:1B:84:62:09:21:87:5A:B7:58:F0:19:8A:AD:93:F3:99",
    ]);
  });
});
