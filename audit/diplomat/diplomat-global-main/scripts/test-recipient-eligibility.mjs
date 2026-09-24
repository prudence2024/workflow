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

async function testEligibility() {
  console.log("=== RECIPIENT ELIGIBILITY TEST ===\n");

  // Test 1: Create a suppressed email
  console.log("Test 1: Create suppressed email");
  const { error: suppErr } = await db.from("marketing_suppression").upsert(
    { email: "suppressed-test@example.com", reason: "unsubscribed", source: "test" },
    { onConflict: "email" }
  );
  console.log(suppErr ? `❌ ${suppErr.message}` : "✅ Suppression created");

  // Test 2: Create a customer with marketing_consent=false
  console.log("\nTest 2: Create customer with consent=false");
  const { data: cust, error: custErr } = await db.from("customers").insert({
    email: "suppressed-test@example.com",
    first_name: "Suppressed",
    last_name: "Test",
    marketing_consent: false,
  }).select();
  console.log(custErr ? `❌ ${custErr.message}` : `✅ Customer created (id=${cust[0].id})`);

  // Test 3: Simulate recipient aggregation (what adminListRecipients does)
  console.log("\nTest 3: Recipient aggregation");
  const { data: customers } = await db.from("customers")
    .select("email, first_name, last_name, phone, marketing_consent, created_at");
  const { data: subs } = await db.from("newsletter_subscribers")
    .select("email, created_at, is_active")
    .eq("is_active", true);
  const { data: suppressedRows } = await db.from("marketing_suppression").select("email");
  const suppressedEmails = new Set(
    (suppressedRows || []).map(s => s.email?.toLowerCase().trim()).filter(Boolean)
  );
  
  const emailMap = new Map();
  for (const c of customers || []) {
    const email = c.email?.toLowerCase().trim();
    if (!email) continue;
    emailMap.set(email, {
      email,
      first_name: c.first_name,
      last_name: c.last_name,
      marketing_consent: c.marketing_consent || false,
      suppressed: suppressedEmails.has(email),
    });
  }
  
  const allRecipients = Array.from(emailMap.values());
  const suppressed = allRecipients.filter(r => r.suppressed);
  const eligible = allRecipients.filter(r => !r.suppressed && r.marketing_consent !== false);
  
  console.log(`   Total recipients: ${allRecipients.length}`);
  console.log(`   Suppressed: ${suppressed.length}`);
  console.log(`   Eligible: ${eligible.length}`);
  console.log(`   Suppressed email in eligible: ${eligible.some(r => r.email === "suppressed-test@example.com") ? "❌ YES (BAD)" : "✅ NO (GOOD)"}`);

  // Test 4: Simulate server-side send filtering
  console.log("\nTest 4: Server-side send filtering");
  const injectedRecipients = [
    { email: "suppressed-test@example.com", first_name: "Injected" },
    { email: "safe@example.com", first_name: "Safe" },
  ];
  
  // Server re-checks suppression before sending
  const { data: recheckSuppressed } = await db.from("marketing_suppression")
    .select("email");
  const recheckSet = new Set(
    (recheckSuppressed || []).map(s => s.email?.toLowerCase().trim()).filter(Boolean)
  );
  const serverEligible = injectedRecipients.filter(
    r => !recheckSet.has(r.email.toLowerCase().trim())
  );
  
  console.log(`   Injected: ${injectedRecipients.length} recipients`);
  console.log(`   Server eligible: ${serverEligible.length}`);
  console.log(`   Suppressed removed: ${injectedRecipients.length - serverEligible.length}`);
  console.log(`   Suppressed email in send: ${serverEligible.some(r => r.email === "suppressed-test@example.com") ? "❌ YES (BAD)" : "✅ NO (GOOD)"}`);

  // Cleanup
  await db.from("customers").delete().eq("email", "suppressed-test@example.com");
  await db.from("marketing_suppression").delete().eq("email", "suppressed-test@example.com");
  console.log("\n   Cleaned up test data");

  console.log("\n=== ALL TESTS COMPLETE ===");
}

testEligibility().catch(e => { console.error("Fatal:", e); process.exit(1); });
