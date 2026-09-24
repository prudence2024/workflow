import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Load env
const env = readFileSync(".env.local", "utf-8");
const vars = {};
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq > 0) vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const url = vars.SUPABASE_URL || vars.VITE_SUPABASE_URL;
const key = vars.SUPABASE_SECRET_KEY || vars.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const db = createClient(url, key);

async function query(table, select = "*", filters = {}, opts = {}) {
  let q = db.from(table).select(select, opts);
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) q = q.is(k, null);
    else q = q.eq(k, v);
  }
  return q;
}

async function main() {
  const results = {};

  // ═══════════════════════════════════════════════════════
  // 1. MARKETING SUPPRESSION TABLE
  // ═══════════════════════════════════════════════════════
  console.log("\n=== MARKETING SUPPRESSION ===");
  const { data: suppression, error: suppErr } = await query("marketing_suppression", "id, email, reason, source, created_at", {}, { count: "exact" });
  if (suppErr) {
    console.log("❌ Table error:", suppErr.message);
    results.suppressionTable = "❌ " + suppErr.message;
  } else {
    console.log(`✅ Table exists, ${suppression?.length || 0} rows`);
    for (const s of suppression || []) {
      console.log(`  - ${s.email} (${s.reason}/${s.source})`);
    }
    results.suppressionTable = `✅ ${suppression?.length || 0} rows`;
  }

  // ═══════════════════════════════════════════════════════
  // 2. UNSUBSCRIBE TOKENS — ALL NON-NULL
  // ═══════════════════════════════════════════════════════
  console.log("\n=== UNSUBSCRIBE TOKENS ===");
  const { data: nullTokens } = await query("customers", "id", { unsubscribe_token: null });
  const { count: totalCustomers } = await query("customers", "id", {}, { count: "exact", head: true });
  console.log(`Customers: ${totalCustomers || 0} total, ${nullTokens?.length || 0} with NULL token`);
  results.customerTokens = nullTokens?.length === 0 ? "✅ All non-NULL" : `❌ ${nullTokens?.length} NULL tokens`;

  const { data: nullNsTokens } = await query("newsletter_subscribers", "id", { unsubscribe_token: null });
  const { count: totalNs } = await query("newsletter_subscribers", "id", {}, { count: "exact", head: true });
  console.log(`Newsletter: ${totalNs || 0} total, ${nullNsTokens?.length || 0} with NULL token`);
  results.newsletterTokens = nullNsTokens?.length === 0 ? "✅ All non-NULL" : `❌ ${nullNsTokens?.length} NULL tokens`;

  // ═══════════════════════════════════════════════════════
  // 3. TESTIMONIAL MODERATION STATUS
  // ═══════════════════════════════════════════════════════
  console.log("\n=== TESTIMONIAL MODERATION ===");
  const { data: testimonials, error: testErr } = await query("testimonials", "id, name, active, moderation_status, consent_to_publish, moderated_at");
  if (testErr) {
    console.log("❌ Error:", testErr.message);
    results.testimonialModeration = "❌ " + testErr.message;
  } else {
    for (const t of testimonials || []) {
      console.log(`  - "${t.name}" active=${t.active} mod=${t.moderation_status} consent=${t.consent_to_publish}`);
    }
    const approved = testimonials?.filter(t => t.moderation_status === "approved").length || 0;
    const pending = testimonials?.filter(t => t.moderation_status === "pending").length || 0;
    const rejected = testimonials?.filter(t => t.moderation_status === "rejected").length || 0;
    console.log(`  Summary: ${approved} approved, ${pending} pending, ${rejected} rejected`);
    results.testimonialModeration = `${approved} approved, ${pending} pending, ${rejected} rejected`;
  }

  // ═══════════════════════════════════════════════════════
  // 4. AUDIT LOGS — PERMISSION DENIED EVENTS
  // ═══════════════════════════════════════════════════════
  console.log("\n=== AUDIT LOGS — PERMISSION DENIED ===");
  const { data: deniedEvents } = await db
    .from("audit_logs")
    .select("id, clerk_user_id, action, metadata, created_at")
    .eq("action", "admin_permission_denied")
    .order("created_at", { ascending: false })
    .limit(10);
  
  const totalDenied = deniedEvents?.length || 0;
  console.log(`Last 10 permission denied events: ${totalDenied}`);
  for (const e of deniedEvents || []) {
    const meta = e.metadata || {};
    console.log(`  [${e.created_at}] user=${e.clerk_user_id?.slice(0,8)}... perm=${meta.permission} context=${meta.context} role=${meta.role}`);
  }
  results.permissionDenied = `${totalDenied} events shown`;

  // ═══════════════════════════════════════════════════════
  // 5. SESSION EVENTS — admin_session_started
  // ═══════════════════════════════════════════════════════
  console.log("\n=== SESSION EVENTS ===");
  const { data: sessions } = await db
    .from("audit_logs")
    .select("id, clerk_user_id, action, metadata, created_at")
    .eq("action", "admin_session_started")
    .order("created_at", { ascending: false })
    .limit(10);
  
  console.log(`Last 10 session events: ${sessions?.length || 0}`);
  const sessionIds = new Set();
  for (const s of sessions || []) {
    const sid = s.metadata?.session_id || "none";
    sessionIds.add(sid);
    console.log(`  [${s.created_at}] user=${s.clerk_user_id?.slice(0,8)}... session=${sid.slice(0,12)}...`);
  }
  console.log(`  Unique session IDs: ${sessionIds.size}`);
  results.sessionEvents = `${sessions?.length || 0} events, ${sessionIds.size} unique sessions`;

  // ═══════════════════════════════════════════════════════
  // 6. ADMIN NOTIFICATION READS
  // ═══════════════════════════════════════════════════════
  console.log("\n=== ADMIN NOTIFICATION READS ===");
  const { data: reads, error: readsErr } = await query("admin_notification_reads", "id, admin_user_id, audit_log_id, read_at", {}, { count: "exact" });
  if (readsErr) {
    console.log("❌ Error:", readsErr.message);
    results.notificationReads = "❌ " + readsErr.message;
  } else {
    console.log(`✅ ${reads?.length || 0} read receipts`);
    for (const r of reads || []) {
      console.log(`  - admin=${r.admin_user_id?.slice(0,8)}... log=${r.audit_log_id} read_at=${r.read_at}`);
    }
    results.notificationReads = `✅ ${reads?.length || 0} rows`;
  }

  // ═══════════════════════════════════════════════════════
  // 7. ADMIN ROLE PERMISSIONS
  // ═══════════════════════════════════════════════════════
  console.log("\n=== ADMIN ROLE PERMISSIONS ===");
  const { data: adminUsers } = await db
    .from("admin_users")
    .select("id, clerk_user_id, role_id, active, roles!inner(key)")
    .eq("active", true);
  
  for (const u of adminUsers || []) {
    const roleKey = u.roles?.key;
    const { count: permCount } = await db
      .from("role_permissions")
      .select("id", { count: "exact", head: true })
      .eq("role_id", u.role_id);
    console.log(`  - user=${u.clerk_user_id?.slice(0,8)}... role=${roleKey} (${permCount} permissions)`);
  }
  results.adminRoles = `${adminUsers?.length || 0} active admins`;

  // ═══════════════════════════════════════════════════════
  // 8. CUSTOMER MARKETING STATE
  // ═══════════════════════════════════════════════════════
  console.log("\n=== CUSTOMER MARKETING STATE ===");
  const { data: customers } = await db
    .from("customers")
    .select("id, email, marketing_consent, marketing_unsubscribed_at")
    .limit(10);
  for (const c of customers || []) {
    console.log(`  - ${c.email}: consent=${c.marketing_consent} unsub_at=${c.marketing_unsubscribed_at || "null"}`);
  }

  // ═══════════════════════════════════════════════════════
  // 9. NEWSLETTER SUBSCRIBER STATE
  // ═══════════════════════════════════════════════════════
  console.log("\n=== NEWSLETTER SUBSCRIBERS ===");
  const { data: subs } = await db
    .from("newsletter_subscribers")
    .select("id, email, is_active, unsubscribed_at")
    .limit(10);
  for (const s of subs || []) {
    console.log(`  - ${s.email}: active=${s.is_active} unsub_at=${s.unsubscribed_at || "null"}`);
  }

  console.log("\n\n═══════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
