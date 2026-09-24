// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";

const sentryRelease = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || "";
const sentryBuildConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT &&
  sentryRelease,
);

export default defineConfig({
  // Diplomat deploys on Vercel. Pinning the preset keeps local production
  // builds and runtime verification identical to the deployment artifact.
  nitro: { preset: "vercel" },
  plugins: sentryBuildConfigured
    ? sentryTanstackStart({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        release: { name: sentryRelease },
        telemetry: false,
        sourcemaps: {
          filesToDeleteAfterUpload: [".output/public/**/*.map"],
        },
      })
    : [],
  vite: sentryBuildConfigured ? { build: { sourcemap: "hidden" } } : {},
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
