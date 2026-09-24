import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf-8");
const vars = {};
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq > 0) vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const db = createClient(vars.SUPABASE_URL || vars.VITE_SUPABASE_URL, vars.SUPABASE_SECRET_KEY || vars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // 1. Check admin role permission count
  console.log("=== ADMIN ROLE PERMISSION COUNT ===");
  const { data: adminUser } = await db
    .from("admin_users")
    .select("id, role_id, roles!inner(key)")
    .eq("active", true)
    .eq("roles.key", "admin")
    .limit(1)
    .single();
  
  if (adminUser) {
    console.log(`Admin role_id: ${adminUser.role_id}`);
    const { data: perms, count } = await db
      .from("role_permissions")
      .select("permission_id, permissions!inner(key)", { count: "exact" })
      .eq("role_id", adminUser.role_id);
    console.log(`Admin role has ${count} role_permissions`);
    if (perms) {
      for (const p of perms) {
        console.log(`  - ${p.permissions?.key}`);
      }
    }
  } else {
    console.log("❌ No active admin user found");
  }

  // 2. Permission denied AFTER deployment — check for new-format events
  console.log("\n=== PERMISSION DENIED — LAST 24h WITH DETAILS ===");
  const { data: recentDenied } = await db
    .from("audit_logs")
    .select("id, clerk_user_id, action, metadata, created_at")
    .eq("action", "admin_permission_denied")
    .gte("created_at", new Date(Date.now() - 24*60*60*1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  console.log(`Total permission denied in last 24h: ${recentDenied?.length || 0}`);
  
  // Separate old-format (context=undefined) from new-format
  const oldFormat = recentDenied?.filter(e => !e.metadata?.context) || [];
  const newFormat = recentDenied?.filter(e => e.metadata?.context) || [];
  console.log(`  Old format (context=undefined, from pre-deploy code): ${oldFormat.length}`);
  console.log(`  New format (has context, from current code): ${newFormat.length}`);
  
  if (oldFormat.length > 0) {
    console.log(`  Most recent old-format event: ${oldFormat[0].created_at}`);
  }
  if (newFormat.length > 0) {
    console.log(`  ⚠️ NEW permission denied events AFTER deploy:`);
    for (const e of newFormat) {
      const meta = e.metadata || {};
      console.log(`    [${e.created_at}] perm=${meta.permission} context=${meta.context} role=${meta.role}`);
    }
  }

  // 3. Check ALL audit events after latest session to see if new denials appeared
  console.log("\n=== AUDIT EVENTS AFTER LATEST SESSION START ===");
  const { data: latestSession } = await db
    .from("audit_logs")
    .select("created_at")
    .eq("action", "admin_session_started")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  
  if (latestSession) {
    console.log(`Latest session: ${latestSession.created_at}`);
    const { data: afterSession } = await db
      .from("audit_logs")
      .select("action, created_at, metadata")
      .gte("created_at", latestSession.created_at)
      .order("created_at", { ascending: true });
    
    console.log(`Events after latest session: ${afterSession?.length || 0}`);
    for (const e of afterSession || []) {
      const extra = e.metadata?.permission ? ` perm=${e.metadata.permission}` : "";
      console.log(`  [${e.created_at}] ${e.action}${extra}`);
    }
  }

  // 4. Check the owner has permissions correctly
  console.log("\n=== OWNER ROLE ===");
  const { data: ownerUser } = await db
    .from("admin_users")
    .select("id, role_id, roles!inner(key)")
    .eq("active", true)
    .eq("roles.key", "owner")
    .limit(1)
    .single();
  console.log(`Owner: role_id=${ownerUser?.role_id}`);

  // 5. Notification read persistence test — check recent reads
  console.log("\n=== NOTIFICATION READ PERSISTENCE ===");
  const { data: recentReads } = await db
    .from("admin_notification_reads")
    .select("id, admin_user_id, audit_log_id, read_at")
    .order("read_at", { ascending: false })
    .limit(5);
  console.log(`Recent ${recentReads?.length || 0} read receipts:`);
  for (const r of recentReads || []) {
    console.log(`  - admin=${r.admin_user_id?.slice(0,8)}... audit_log=${r.audit_log_id} at=${r.read_at}`);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
