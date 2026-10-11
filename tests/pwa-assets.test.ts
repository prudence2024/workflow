import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function pngSize(path: string): string {
  const bytes = readFileSync(resolve(root, path));
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("PWA and Android preparation", () => {
  it("declares an app-first manifest with the Workflow identity", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8")) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };

    expect(manifest.name).toBe("Workflow");
    expect(manifest.short_name).toBe("Workflow");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("/auth/complete");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/workflow-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icons/workflow-512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/icons/workflow-512-maskable.png", sizes: "512x512", purpose: "maskable" }),
    ]));
  });

  it("ships exact required icon dimensions", () => {
    expect(pngSize("public/icons/workflow-192.png")).toBe("192x192");
    expect(pngSize("public/icons/workflow-512.png")).toBe("512x512");
    expect(pngSize("public/icons/workflow-192-maskable.png")).toBe("192x192");
    expect(pngSize("public/icons/workflow-512-maskable.png")).toBe("512x512");
  });

  it("keeps authenticated and action-sensitive requests network-only", () => {
    const serviceWorker = readFileSync(resolve(root, "public/sw.js"), "utf8");

    expect(serviceWorker).toContain("request.mode === \"navigate\"");
    expect(serviceWorker).toContain("url.searchParams.has(\"_rsc\")");
    expect(serviceWorker).toContain("request.headers.has(\"Next-Action\")");
    expect(serviceWorker).toContain("url.pathname.startsWith(\"/api/\")");
  });

  it("points the native wrapper at Netlify rather than Cloudflare", () => {
    const capacitor = readFileSync(resolve(root, "capacitor.config.ts"), "utf8");
    expect(capacitor).toContain("https://workflow-application.netlify.app");
    expect(capacitor).not.toContain("workflow-testing.okwuborprudence.workers.dev");
  });
});
