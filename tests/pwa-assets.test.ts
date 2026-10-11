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
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };

    expect(manifest.name).toBe("Workflow");
    expect(manifest.short_name).toBe("Workflow");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("/auth/complete");
    expect(manifest.theme_color).toBe("#0B1F3B");
    expect(manifest.background_color).toBe(manifest.theme_color);
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/workflow-app-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icons/workflow-app-512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/icons/workflow-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
  });

  it("ships exact required icon dimensions", () => {
    expect(pngSize("public/icons/workflow-app-192.png")).toBe("192x192");
    expect(pngSize("public/icons/workflow-app-512.png")).toBe("512x512");
    expect(pngSize("public/icons/workflow-maskable-192.png")).toBe("192x192");
    expect(pngSize("public/icons/workflow-maskable-512.png")).toBe("512x512");
  });

  it("uses the full-bleed icon for legacy Android densities and a padded maskable layer", () => {
    for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
      expect(pngSize(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`)).toBe(`${size}x${size}`);
      expect(pngSize(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`)).toBe(`${size}x${size}`);
    }

    const adaptiveIcon = readFileSync(resolve(root, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
    expect(adaptiveIcon).toContain("@drawable/workflow_icon_maskable");
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
