import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the browser's RSC/action references tied to one generated deployment.
  // The worker build wrapper supplies a fresh value for every package, which
  // lets Next recover from an older open tab instead of mixing deployments.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.BUILD_GIT_SHA,
  // The app is prepared to run on Cloudflare Workers (see wrangler.jsonc), where
  // Next's native image optimizer (sharp) is unavailable. Brand assets are
  // pre-optimised into public/brand, so the built-in optimizer is disabled and
  // images render identically in dev, on Workers and anywhere else.
  images: {
    unoptimized: true,
  },
  // `pg` must not be bundled: it opens TCP sockets and loads optional native
  // bindings, neither of which survives a bundler transform.
  // `playwright-core` must not be bundled either: it spawns Chromium and
  // requires Node builtins (chromium-bidi) that break the Workers bundle.
  // Browser analysis stays a Node-only runtime path (fail-closed on edge).
  serverExternalPackages: ["pg", "playwright-core", "bcryptjs", "cheerio", "xlsx"],
};

export default nextConfig;
