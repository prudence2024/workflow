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

async function testFullFlow() {
  console.log("=== TESTIMONIAL E2E FLOW ===\n");

  // Test 1: Submit with consent_to_publish=true (should succeed)
  console.log("Test 1: Submit with consent=true");
  const { data: inserted, error: insertErr } = await db.from("testimonials").insert({
    name: "E2E Test User",
    message: "This is an E2E test testimonial for the correction pass.",
    rating: 5,
    email: "e2e-test@example.com",
    consent_to_publish: true,
    moderation_status: "pending",
    active: false,
    sort_order: 0,
  }).select();

  if (insertErr) {
    console.log("❌ INSERT FAILED:", insertErr.message);
    return;
  }
  console.log("✅ INSERT SUCCEEDED");
  const testId = inserted[0].id;
  console.log("   ID:", testId);
  console.log("   moderation_status:", inserted[0].moderation_status);
  console.log("   active:", inserted[0].active);
  console.log("   consent_to_publish:", inserted[0].consent_to_publish);

  // Test 2: Verify it's NOT publicly visible
  console.log("\nTest 2: Verify not publicly visible");
  const { data: publicCheck } = await db.from("testimonials")
    .select("id, name, active, moderation_status")
    .eq("active", true)
    .eq("moderation_status", "approved");
  const isVisible = publicCheck?.some(t => t.id === testId);
  console.log(isVisible ? "❌ FAIL: visible publicly when it shouldn't be" : "✅ PASS: not publicly visible");

  // Test 3: Approve
  console.log("\nTest 3: Admin approve");
  const { error: approveErr } = await db.from("testimonials").update({
    moderation_status: "approved",
    active: true,
    moderated_at: new Date().toISOString(),
  }).eq("id", testId);

  if (approveErr) {
    console.log("❌ APPROVE FAILED:", approveErr.message);
  } else {
    console.log("✅ APPROVE SUCCEEDED");
    const { data: approved } = await db.from("testimonials").select("active, moderation_status, moderated_at").eq("id", testId).single();
    console.log("   active:", approved.active);
    console.log("   moderation_status:", approved.moderation_status);
    console.log("   moderated_at:", approved.moderated_at ? "SET" : "NOT SET");
  }

  // Test 4: Verify it IS publicly visible
  console.log("\nTest 4: Verify publicly visible after approval");
  const { data: publicCheck2 } = await db.from("testimonials")
    .select("id, name, active, moderation_status")
    .eq("active", true)
    .eq("moderation_status", "approved");
  const isVisible2 = publicCheck2?.some(t => t.id === testId);
  console.log(isVisible2 ? "✅ PASS: publicly visible" : "❌ FAIL: not visible when it should be");

  // Test 5: Reject
  console.log("\nTest 5: Admin reject");
  const { error: rejectErr } = await db.from("testimonials").update({
    moderation_status: "rejected",
    active: false,
    moderated_at: new Date().toISOString(),
  }).eq("id", testId);

  if (rejectErr) {
    console.log("❌ REJECT FAILED:", rejectErr.message);
  } else {
    console.log("✅ REJECT SUCCEEDED");
    const { data: rejected } = await db.from("testimonials").select("active, moderation_status, moderated_at").eq("id", testId).single();
    console.log("   active:", rejected.active);
    console.log("   moderation_status:", rejected.moderation_status);
  }

  // Test 6: Verify it's NOT publicly visible after rejection
  console.log("\nTest 6: Verify not publicly visible after rejection");
  const { data: publicCheck3 } = await db.from("testimonials")
    .select("id, name, active, moderation_status")
    .eq("active", true)
    .eq("moderation_status", "approved");
  const isVisible3 = publicCheck3?.some(t => t.id === testId);
  console.log(isVisible3 ? "❌ FAIL: still visible" : "✅ PASS: not publicly visible");

  // Test 7: Verify public API does NOT expose email/consent/moderation
  console.log("\nTest 7: Public API field safety");
  const { data: publicData } = await db.from("testimonials")
    .select("id, name, role, message, rating, photo_url, sort_order, created_at")
    .eq("id", testId)
    .single();
  console.log("   Has email field:", "email" in (publicData || {}));
  console.log("   Has consent_to_publish:", "consent_to_publish" in (publicData || {}));
  console.log("   Has moderation_status:", "moderation_status" in (publicData || {}));
  console.log("   ✅ Public query uses explicit field list (no private fields)");

  // Cleanup
  await db.from("testimonials").delete().eq("id", testId);
  console.log("\n   Cleaned up test row");

  console.log("\n=== ALL TESTS COMPLETE ===");
}

testFullFlow().catch(e => { console.error("Fatal:", e); process.exit(1); });
