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
  console.log("═══════════════════════════════════════════════════");
  console.log("DIPLOMAT GLOBAL — RUNTIME ACCEPTANCE DB EVIDENCE");
  console.log("═══════════════════════════════════════════════════");

  // 1. NOTIFICATION READ PERSISTENCE
  console.log("\n=== 1. NOTIFICATION READ PERSISTENCE ===");
  const { data: reads, count: readCount } = await db
    .from("admin_notification_reads")
    .select("id, admin_user_id, audit_log_id, read_at", { count: "exact" });
  console.log(`Total read receipts: ${readCount}`);
  
  // Check uniqueness
  const readKeys = new Set();
  let readDups = 0;
  for (const r of reads || []) {
    const key = `${r.admin_user_id}:${r.audit_log_id}`;
    if (readKeys.has(key)) readDups++;
    readKeys.add(key);
  }
  console.log(`Duplicates: ${readDups}`);
  
  // Check for unread security events
  const { data: securityEvents } = await db
    .from("audit_logs")
    .select("id, action, created_at")
    .in("action", ["admin_permission_denied", "unauthorized_admin_access", "staff.role_changed", "staff.invited", "staff.activated", "staff.deactivated"])
    .order("created_at", { ascending: false })
    .limit(20);
  
  const readIds = new Set((reads || []).map(r => r.audit_log_id));
  const unread = (securityEvents || []).filter(e => !readIds.has(e.id));
  console.log(`Security events: ${securityEvents?.length || 0} total, ${unread.length} unread`);
  if (unread.length > 0) {
    for (const e of unread.slice(0, 5)) {
      console.log(`  UNREAD: [${e.created_at}] ${e.action} (id=${e.id})`);
    }
  }

  // 2. SESSION DEDUP
  console.log("\n=== 2. SESSION DEDUP ===");
  const { data: sessions } = await db
    .from("audit_logs")
    .select("id, clerk_user_id, metadata, created_at")
    .eq("action", "admin_session_started")
    .order("created_at", { ascending: false })
    .limit(10);
  
  console.log(`Total session events: ${sessions?.length || 0}`);
  
  // Group by session_id
  const sessionGroups = {};
  for (const s of sessions || []) {
    const sid = s.metadata?.session_id || "none";
    if (!sessionGroups[sid]) sessionGroups[sid] = [];
    sessionGroups[sid].push(s);
  }
  for (const [sid, events] of Object.entries(sessionGroups)) {
    console.log(`  Session ${sid.slice(0,16)}...: ${events.length} event(s), first=${events[0].created_at}, user=${events[0].clerk_user_id?.slice(0,8)}...`);
  }

  // 3. PERMISSION DENIED — POST DEPLOY
  console.log("\n=== 3. PERMISSION DENIED POST-DEPLOY ===");
  // Find the latest session start time
  const latestSession = sessions?.[0];
  if (latestSession) {
    const { data: postDeployDenied } = await db
      .from("audit_logs")
      .select("id, clerk_user_id, metadata, created_at")
      .eq("action", "admin_permission_denied")
      .gte("created_at", latestSession.created_at);
    console.log(`Permission denied after latest session (${latestSession.created_at}): ${postDeployDenied?.length || 0}`);
  }
  
  // Also check last 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentDenied } = await db
    .from("audit_logs")
    .select("id, metadata, created_at")
    .eq("action", "admin_permission_denied")
    .gte("created_at", oneHourAgo);
  console.log(`Permission denied in last hour: ${recentDenied?.length || 0}`);

  // 4. TESTIMONIAL MODERATION
  console.log("\n=== 4. TESTIMONIAL MODERATION ===");
  const { data: testimonials } = await db
    .from("testimonials")
    .select("id, name, active, moderation_status, consent_to_publish, moderated_at, email, photo_url");
  console.log(`Total testimonials: ${testimonials?.length || 0}`);
  for (const t of testimonials || []) {
    console.log(`  "${t.name}" active=${t.active} mod=${t.moderation_status} consent=${t.consent_to_publish} email=${t.email || 'null'} photo=${t.photo_url ? 'yes' : 'null'} moderated=${t.moderated_at || 'null'}`);
  }

  // 5. MARKETING SUPPRESSION
  console.log("\n=== 5. MARKETING SUPPRESSION ===");
  const { data: suppressed } = await db.from("marketing_suppression").select("id, email, reason, source, created_at");
  console.log(`Suppressed emails: ${suppressed?.length || 0}`);
  for (const s of suppressed || []) {
    console.log(`  ${s.email} reason=${s.reason} source=${s.source}`);
  }

  // 6. CUSTOMER STATE
  console.log("\n=== 6. CUSTOMER MARKETING STATE ===");
  const { data: customers } = await db
    .from("customers")
    .select("id, email, first_name, last_name, marketing_consent, marketing_consent_at, marketing_unsubscribed_at, unsubscribe_token");
  for (const c of customers || []) {
    console.log(`  ${c.email} consent=${c.marketing_consent} consent_at=${c.marketing_consent_at || 'null'} unsub_at=${c.marketing_unsubscribed_at || 'null'} token=${c.unsubscribe_token ? 'yes' : 'null'}`);
  }

  // 7. NEWSLETTER STATE
  console.log("\n=== 7. NEWSLETTER SUBSCRIBERS ===");
  const { data: subs } = await db
    .from("newsletter_subscribers")
    .select("id, email, is_active, unsubscribed_at, unsubscribe_token");
  for (const s of subs || []) {
    console.log(`  ${s.email} active=${s.is_active} unsub_at=${s.unsubscribed_at || 'null'} token=${s.unsubscribe_token ? 'yes' : 'null'}`);
  }

  // 8. PRODUCT IMAGES
  console.log("\n=== 8. PRODUCT IMAGES ===");
  const { data: products } = await db
    .from("products")
    .select("id, name, slug, in_stock")
    .limit(5);
  for (const p of products || []) {
    const { data: images } = await db
      .from("product_images")
      .select("id, secure_url, cloudinary_public_id, sort_order")
      .eq("product_id", p.id)
      .order("sort_order");
    console.log(`  "${p.name}" (${p.slug}): ${images?.length || 0} images`);
    for (const img of images || []) {
      console.log(`    [${img.sort_order}] ${img.secure_url?.slice(0, 60)}...`);
    }
  }

  // 9. INVENTORY
  console.log("\n=== 9. INVENTORY ===");
  const { data: inventory } = await db
    .from("inventory")
    .select("product_id, quantity, low_stock_threshold, products(name)");
  console.log(`Inventory rows: ${inventory?.length || 0}`);
  for (const i of inventory || []) {
    console.log(`  ${i.products?.name || 'Unknown'}: qty=${i.quantity} threshold=${i.low_stock_threshold}`);
  }

  // 10. CATEGORIES
  console.log("\n=== 10. CATEGORIES ===");
  const { data: categories } = await db.from("categories").select("id, name, slug, active").order("sort_order");
  console.log(`Categories: ${categories?.length || 0}`);
  for (const c of categories || []) {
    console.log(`  "${c.name}" (${c.slug}) active=${c.active}`);
  }

  // 11. HERO SLIDES
  console.log("\n=== 11. HERO SLIDES ===");
  const { data: slides } = await db.from("hero_slides").select("id, title, subtitle, image, active, sort_order").order("sort_order");
  console.log(`Slides: ${slides?.length || 0}`);
  for (const s of slides || []) {
    console.log(`  "${s.title}" image=${s.image ? s.image.slice(0, 50) + '...' : 'NULL'} active=${s.active} order=${s.sort_order}`);
  }

  // 12. SOCIAL LINKS
  console.log("\n=== 12. SOCIAL LINKS ===");
  const { data: socials } = await db.from("social_links").select("id, platform, url, sort_order");
  console.log(`Social links: ${socials?.length || 0}`);
  for (const s of socials || []) {
    console.log(`  ${s.platform}: ${s.url}`);
  }

  // 13. SITE SETTINGS
  console.log("\n=== 13. SITE SETTINGS ===");
  const { data: settings } = await db.from("site_settings").select("key, value");
  const settingsMap = {};
  for (const s of settings || []) settingsMap[s.key] = s.value;
  
  const relevantKeys = [
    "contact_phone", "contact_email", "whatsapp_url", "contact_type",
    "social_instagram", "social_facebook", "social_twitter", "social_youtube", "social_tiktok",
    "about_page_faq", "founder_name", "founder_title", "founder_photo", "founder_bio", "founder_story"
  ];
  for (const k of relevantKeys) {
    const v = settingsMap[k];
    if (v !== undefined) {
      console.log(`  ${k}: ${v.length > 100 ? v.slice(0, 100) + '...' : v}`);
    }
  }

  // 14. COMMUNICATION LOGS
  console.log("\n=== 14. COMMUNICATION LOGS ===");
  const { data: commLogs } = await db.from("communication_logs").select("id, type, recipient, status, provider_message_id, sent_at").order("sent_at", { ascending: false }).limit(5);
  console.log(`Recent comms: ${commLogs?.length || 0}`);
  for (const c of commLogs || []) {
    console.log(`  ${c.type} → ${c.recipient} status=${c.status} msgId=${c.provider_message_id || 'null'} at=${c.sent_at}`);
  }

  // 15. PAGES
  console.log("\n=== 15. PAGES ===");
  const { data: pages } = await db.from("pages").select("id, slug, title, content").limit(10);
  console.log(`Pages: ${pages?.length || 0}`);
  for (const p of pages || []) {
    console.log(`  "${p.title}" (/${p.slug}) content=${p.content ? p.content.length + ' chars' : 'empty'}`);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("DB EVIDENCE COMPLETE");
  console.log("═══════════════════════════════════════════════════");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
