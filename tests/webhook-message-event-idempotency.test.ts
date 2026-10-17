import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("provider message evidence deduplication", () => {
  it("serializes provider-event check and insert without requiring a migration", () => {
    const source = fs.readFileSync(new URL("../src/lib/webhooks.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

    expect(source).toContain("db.transaction(async (tx)");
    expect(source).toContain("pg_advisory_xact_lock(hashtext");
    expect(source).toContain("where provider = ${params.provider} and provider_event_id = ${params.providerEventId}");
    expect(source).toContain("await tx.execute(sql`\n        insert into public.message_events");
  });

  it("leaves callbacks without a provider event id on the existing append path", () => {
    const source = fs.readFileSync(new URL("../src/lib/webhooks.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain("if (params.providerEventId)");
    expect(source).toContain("await db.execute(sql`\n    insert into public.message_events");
  });
});
