#!/usr/bin/env node
/**
 * DIPLOMAT GLOBAL — System Breaker + System Attacker (v3)
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

let pass = 0,
  fail = 0,
  warn = 0;
const findings = [];

function check(name, ok, evidence, severity = "MEDIUM") {
  if (ok) pass++;
  else {
    fail++;
    findings.push({ name, evidence, severity });
  }
  console.log(`  ${ok ? "✅" : "❌"} ${name}: ${evidence}`);
}
function wCheck(name, ok, evidence) {
  if (ok) pass++;
  else warn++;
  console.log(`  ${ok ? "✅" : "⚠️"} ${name}: ${evidence}`);
}

function fileExists(p) {
  return existsSync(join(".", p));
}
function readFile(p) {
  return readFileSync(join(".", p), "utf-8");
}

function findFiles(dir, exts, results = []) {
  try {
    for (const e of readdirSync(join(".", dir), { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory() && !["node_modules", ".git", "dist", ".next"].includes(e.name))
        findFiles(full, exts, results);
      else if (e.isFile() && exts.some((ext) => e.name.endsWith(ext))) results.push(full);
    }
  } catch {}
  return results;
}

function srcSearch(pattern) {
  const re = new RegExp(pattern);
  const files = findFiles("src", [".ts", ".tsx", ".server.ts"]);
  let count = 0;
  for (const f of files) {
    try {
      const content = readFileSync(join(".", f), "utf-8");
      for (const line of content.split("\n")) {
        if (re.test(line)) count++;
      }
    } catch {}
  }
  return count;
}

function srcHas(pattern) {
  return srcSearch(pattern) > 0;
}

function rootSearch(pattern) {
  const re = new RegExp(pattern);
  const files = findFiles(".", [".ts", ".tsx", ".mjs", ".js"]);
  for (const f of files) {
    try {
      const content = readFileSync(join(".", f), "utf-8");
      for (const line of content.split("\n")) {
        if (re.test(line)) return true;
      }
    } catch {}
  }
  return false;
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("  DIPLOMAT GLOBAL — SYSTEM BREAKER + SYSTEM ATTACKER v3");
console.log("═══════════════════════════════════════════════════════════════\n");

// ═══ 1. SECRETS ═══
console.log("▸ 1. SECRETS — Client Bundle Security");
let viteSecrets = false;
for (const f of [".env", ".env.local", ".env.development", ".env.production"]) {
  if (fileExists(f)) {
    for (const line of readFile(f).split("\n")) {
      if (line.startsWith("#") || !line.trim()) continue;
      const [key] = line.split("=");
      if (key?.startsWith("VITE_") && /SECRET|PRIVATE|PASSWORD|TOKEN|SERVICE_ROLE/i.test(key)) {
        viteSecrets = true;
        check("VITE_SECRET", false, `${f}: ${key}`, "CRITICAL");
      }
    }
  }
}
check("NO_VITE_SECRETS", !viteSecrets, "No server secrets under VITE_");

const gi = fileExists(".gitignore") ? readFile(".gitignore") : "";
check("GITIGNORE_ENV", gi.includes(".env"), ".gitignore covers .env");
check("GITIGNORE_FREEBUFF", gi.includes(".freebuff"), ".gitignore covers .freebuff/");
check("GITIGNORE_SUPABASE", gi.includes("supabase/.temp"), ".gitignore covers supabase/.temp/");

let envTracked = false;
try {
  envTracked =
    execSync("git ls-files .env .env.local 2>/dev/null", { encoding: "utf-8" }).trim().length > 0;
} catch {}
check("NO_ENV_IN_GIT", !envTracked, "No .env files tracked in git");

const dsCount = srcSearch("dangerouslySetInnerHTML");
wCheck("DANGEROUSLY_SETInnerHTML", dsCount === 0, `${dsCount} dangerouslySetInnerHTML usages`);
console.log("");

// ═══ 2. AUTH ═══
console.log("▸ 2. AUTHENTICATION / RBAC");
check("REQUIRE_PERMISSION", srcHas("requirePermission"), "requirePermission() exists");
check("REQUIRE_OWNER", srcHas("requireOwner"), "requireOwner() exists");

const authCount = srcSearch("requirePermission|requireOwner");
check("AUTH_CHECKS_ADEQUATE", authCount > 20, `${authCount} authorization checks`);

check(
  "NO_HARDCODED_ROLES",
  !srcHas("role\\s*===\\s*[\"']Owner[\"']"),
  "No hardcoded Owner role string checks",
);
check(
  "NO_HARDCODED_ADMIN",
  !srcHas("role\\s*===\\s*[\"']Admin[\"']"),
  "No hardcoded Admin role string checks",
);
console.log("");

// ═══ 3. INPUT ═══
console.log("▸ 3. INPUT VALIDATION");
const zodCount = srcSearch("z\\.object|z\\.string|z\\.number|z\\.enum|z\\.array");
check("ZOD_VALIDATION", zodCount > 10, `${zodCount} Zod schemas`);
check("CSV_INJECTION", srcHas("escapeCsvCell"), "CSV injection protection");
check("HONEYPOT", srcHas("honeypot|bot_field"), "Honeypot on forms");
console.log("");

// ═══ 4. PAYMENT ═══
console.log("▸ 4. PAYMENT SECURITY");
check("WEBHOOK_HMAC", srcHas("x-paystack-signature|createHmac|HMAC"), "Webhook HMAC verification");
check("IDEMPOTENCY", srcHas("already.*processed|idempoten|deduplicate"), "Payment idempotency");
check("CALLBACK_PREVIEW", srcHas("VERCEL_URL|VITE_SITE_URL"), "Callback URL preview-aware");
const noCacheCount = srcSearch("Cache-Control|no-store|no-cache");
check("CHECKOUT_NO_CACHE", noCacheCount > 0, `${noCacheCount} no-cache headers`);
console.log("");

// ═══ 5. UPLOAD ═══
console.log("▸ 5. UPLOAD SECURITY");
check("CLIENT_MIME", srcHas("ALLOWED|image/jpeg|image/png|image/webp"), "Client MIME allowlist");
check("SERVER_UPLOAD", srcHas("resource_type.*image|upload.*validat"), "Server upload validation");
console.log("");

// ═══ 6. RECEIPT ═══
console.log("▸ 6. RECEIPT SECURITY");
check(
  "OPAQUE_TOKEN",
  srcHas("download_token|downloadToken|receipt.*token"),
  "Receipt opaque token (download_token)",
);
check(
  "TOKEN_NOT_IN_ORDER",
  !srcHas("order.*select.*receipt.*token"),
  "Token not leaked in order API",
);
console.log("");

// ═══ 7. HEADERS ═══
console.log("▸ 7. SECURITY HEADERS");
const srv = fileExists("src/server.ts") ? readFile("src/server.ts") : "";
check("CSP", srv.includes("Content-Security-Policy"), "Content-Security-Policy");
check("X_FRAME", srv.includes("X-Frame-Options"), "X-Frame-Options");
check("PERMISSIONS", srv.includes("Permissions-Policy"), "Permissions-Policy");
check("X_CONTENT", srv.includes("X-Content-Type-Options"), "X-Content-Type-Options");
console.log("");

// ═══ 8. DB ═══
console.log("▸ 8. DATABASE INTEGRITY");
check("SKU_ORDER_ITEMS", srcHas("sku.*order_items|order_items.*sku"), "SKU in order_items");
check(
  "HEALTH_ENDPOINT",
  fileExists("src/routes/api/health.ts") || srcHas("/api/health"),
  "/api/health endpoint",
);
check(
  "WEBHOOK_ENDPOINT",
  fileExists("src/routes/api/webhook/paystack.ts") || srcHas("/api/webhook/paystack"),
  "/api/webhook/paystack",
);
console.log("");

// ═══ 9. ROUTES ═══
console.log("▸ 9. ROUTE STRUCTURE");
const rt = fileExists("src/routeTree.gen.ts") ? readFile("src/routeTree.gen.ts") : "";
check("RT_ORDERS_ID", rt.includes("orders.$id"), "Order detail route");
check("RT_TX_ID", rt.includes("transactions.$id"), "Transaction detail route");
check("RT_CUST_ID", rt.includes("customers.$id"), "Customer detail route");
for (const r of ["index", "shop", "checkout", "about", "contact"]) {
  check(`ROUTE_${r.toUpperCase()}`, fileExists(`src/routes/${r}.tsx`), `/${r} route`);
}
console.log("");

// ═══ 10. SEO ═══
console.log("▸ 10. SEO");
check("ROBOTS", fileExists("public/robots.txt"), "robots.txt");
check("LLMS", fileExists("public/llms.txt"), "llms.txt");
const robots = fileExists("public/robots.txt") ? readFile("public/robots.txt") : "";
check("ROBOTS_DISALLOW_DASH", robots.includes("Disallow: /dashboard"), "Dashboard blocked");
console.log("");

// ═══ 11. CROSS-PROJECT ═══
console.log("▸ 11. CROSS-PROJECT SAFETY");
check("GUARD_SKILL", fileExists(".agents/skills/cross-project-guard/SKILL.md"), "Guard skill");
check("NO_SUPERBASE_REF_IN_SRC", !srcHas("urorrrmyzsuwulfljvwm"), "Supabase ref not in src");
console.log("");

// ═══ 12. COMPONENTS ═══
console.log("▸ 12. COMPONENT QUALITY");
check("OPTIMIZED_IMAGE", fileExists("src/components/optimized-image.tsx"), "OptimizedImage");
check("STYLED_SELECT", fileExists("src/components/ui/styled-select.tsx"), "StyledSelect");
check("PRODUCT_CARD", fileExists("src/components/product-card.tsx"), "ProductCard");
check("SITE_HEADER", fileExists("src/components/site-header.tsx"), "SiteHeader");
check("SITE_FOOTER", fileExists("src/components/site-footer.tsx"), "SiteFooter");
console.log("");

// ═══ 13. GIT ═══
console.log("▸ 13. GIT STATE");
const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
check("BRANCH_TESTING", branch === "testing", `Branch: ${branch}`);
const remote = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
check("REMOTE_CORRECT", remote.includes("diplomat-global"), `Remote OK`);
const head = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
check("HEAD_KNOWN", head.length > 0, `HEAD: ${head}`);
console.log("");

// ═══ SUMMARY ═══
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${pass} PASS | ${fail} FAIL | ${warn} WARN`);
console.log("═══════════════════════════════════════════════════════════════");
if (findings.length > 0) {
  console.log("\n  FAILURES:");
  for (const f of findings) console.log(`  [${f.severity}] ${f.name}: ${f.evidence}`);
}
console.log("  EVIDENCE: CODE INSPECTION + STATIC ANALYSIS");
console.log("  NOTE: Runtime verification requires browser + deployed Preview");
console.log("═══════════════════════════════════════════════════════════════");
process.exit(fail > 0 ? 1 : 0);
