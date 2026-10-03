import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // OpenNext tracing fix (pg 8.20.x + @opennextjs/cloudflare #1214/#1319):
  // pg/lib/stream.js requires "pg-cloudflare" only on the workerd runtime
  // (exports "." workerd.require -> ./dist/index.js). The default-condition
  // trace copies only dist/empty.js, so the workerd file is missing from
  // .open-next/server-functions output ("Could not resolve pg-cloudflare").
  // This includes the Cloudflare-conditioned implementation in standalone
  // tracing without externalizing or changing DB architecture.
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
};

export default nextConfig;
