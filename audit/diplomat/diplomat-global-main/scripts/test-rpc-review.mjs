import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf-8");
const vars = {};
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq > 0) vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

// Simulate what TanStack Start does with the validator
// Test Zod schema validation directly
async function testZodValidation() {
  console.log("=== ZOD VALIDATION TEST ===\n");

  // Import the actual Zod schemas
  const { z } = await import("zod");
  
  // Test 1: Original schema with consent_to_publish
  const originalSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).email().optional().or(z.literal("")),
    rating: z.number().int().min(1).max(5).default(5),
    message: z.string().trim().min(10).max(2000),
    consent_to_publish: z.literal(true),
  });

  // Test with consent=true
  const result1 = originalSchema.safeParse({
    name: "Test User",
    email: "test@example.com",
    rating: 5,
    message: "This is a test testimonial for verification.",
    consent_to_publish: true,
  });
  console.log("Test 1 (consent=true):", result1.success ? "✅ PASS" : "❌ FAIL");
  if (!result1.success) console.log("   Errors:", result1.error.errors);

  // Test with consent=false
  const result2 = originalSchema.safeParse({
    name: "Test User",
    email: "test@example.com",
    rating: 5,
    message: "This is a test testimonial for verification.",
    consent_to_publish: false,
  });
  console.log("Test 2 (consent=false):", result2.success ? "❌ UNEXPECTED PASS" : "✅ CORRECTLY REJECTED");
  if (result2.success) console.log("   WARNING: false was accepted!");

  // Test without consent field
  const result3 = originalSchema.safeParse({
    name: "Test User",
    email: "test@example.com",
    rating: 5,
    message: "This is a test testimonial for verification.",
  });
  console.log("Test 3 (no consent field):", result3.success ? "❌ UNEXPECTED PASS" : "✅ CORRECTLY REJECTED");

  // Test 2: Current schema (no consent_to_publish)
  const currentSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).email().optional().or(z.literal("")),
    rating: z.number().int().min(1).max(5).default(5),
    message: z.string().trim().min(10).max(2000),
  });

  const result4 = currentSchema.safeParse({
    name: "Test User",
    email: "test@example.com",
    rating: 5,
    message: "This is a test testimonial for verification.",
  });
  console.log("\nTest 4 (current schema, no consent):", result4.success ? "✅ PASS" : "❌ FAIL");
  if (result4.success) console.log("   Data:", result4.data);

  // Test 3: Simulate RPC serialization (JSON round-trip)
  console.log("\n=== RPC SERIALIZATION TEST ===");
  const testData = {
    name: "Test User",
    email: "test@example.com",
    rating: 5,
    message: "This is a test testimonial for verification.",
    consent_to_publish: true,
  };
  
  // Simulate JSON serialization (what RPC does)
  const serialized = JSON.parse(JSON.stringify(testData));
  console.log("Original:", testData.consent_to_publish, typeof testData.consent_to_publish);
  console.log("Serialized:", serialized.consent_to_publish, typeof serialized.consent_to_publish);
  console.log("Type preserved:", typeof testData.consent_to_publish === typeof serialized.consent_to_publish ? "✅ YES" : "❌ NO");

  // Now parse with original schema
  const result5 = originalSchema.safeParse(serialized);
  console.log("Schema validation after serialization:", result5.success ? "✅ PASS" : "❌ FAIL");
  if (!result5.success) console.log("   Errors:", result5.error.errors);
}

testZodValidation().catch(e => { console.error("Fatal:", e); process.exit(1); });
