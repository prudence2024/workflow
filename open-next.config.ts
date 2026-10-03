import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Default OpenNext Cloudflare config. No routes are skipped and no
  // behavior is altered: this only adapts the Next.js build output to the
  // Workers runtime (nodejs_compat, see wrangler.jsonc).
});
