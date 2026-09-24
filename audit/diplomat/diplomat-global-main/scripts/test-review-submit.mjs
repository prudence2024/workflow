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

async function testSubmission() {
  console.log("=== TESTIMONIAL SUBMISSION TEST ===\n");

  // Test 1: Try direct Supabase insert (bypassing TanStack RPC)
  console.log("Test 1: Direct Supabase insert with consent_to_publish=true");
  const { data, error } = await db.from("testimonials").insert({
    name: "Test User",
    message: "This is a test testimonial for verification purposes.",
    rating: 5,
    email: "test@example.com",
    consent_to_publish: true,
    moderation_status: "pending",
    active: false,
    sort_order: 0,
  }).select();

  if (error) {
    console.log("❌ INSERT FAILED:", error.message);
    console.log("   Code:", error.code);
    console.log("   Details:", error.details);
    console.log("   Hint:", error.hint);
  } else {
    console.log("✅ INSERT SUCCEEDED");
    console.log("   Row:", JSON.stringify(data?.[0], null, 2));
    
    // Clean up
    if (data?.[0]?.id) {
      await db.from("testimonials").delete().eq("id", data[0].id);
      console.log("   Cleaned up test row");
    }
  }

  // Test 2: Try without consent_to_publish
  console.log("\nTest 2: Direct Supabase insert WITHOUT consent_to_publish");
  const { data: data2, error: error2 } = await db.from("testimonials").insert({
    name: "Test User 2",
    message: "This should fail without consent.",
    rating: 5,
    moderation_status: "pending",
    active: false,
    sort_order: 0,
  }).select();

  if (error2) {
    console.log("❌ INSERT FAILED (expected):", error2.message);
  } else {
    console.log("⚠️ INSERT SUCCEEDED (unexpected - consent_to_publish not enforced at DB level)");
    if (data2?.[0]?.id) {
      await db.from("testimonials").delete().eq("id", data2[0].id);
      console.log("   Cleaned up test row");
    }
  }

  // Test 3: Check testimonials table schema
  console.log("\nTest 3: Testimonials table schema check");
  const { data: sample } = await db.from("testimonials").select("*").limit(1);
  if (sample && sample.length > 0) {
    const cols = Object.keys(sample[0]);
    console.log("   Columns:", cols.join(", "));
    console.log("   Has consent_to_publish:", cols.includes("consent_to_publish"));
    console.log("   Has moderation_status:", cols.includes("moderation_status"));
    console.log("   Has email:", cols.includes("email"));
  }

  // Test 4: Check existing testimonials
  console.log("\nTest 4: Existing testimonials");
  const { data: existing } = await db.from("testimonials").select("id, name, active, moderation_status, consent_to_publish, email");
  for (const t of existing || []) {
    console.log(`   "${t.name}" active=${t.active} mod=${t.moderation_status} consent=${t.consent_to_publish} email=${t.email || 'null'}`);
  }
}

testSubmission().catch(e => { console.error("Fatal:", e); process.exit(1); });
