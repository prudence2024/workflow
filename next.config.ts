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
  serverExternalPackages: ["pg", "bcryptjs", "cheerio", "xlsx"],
};

export default nextConfig;
