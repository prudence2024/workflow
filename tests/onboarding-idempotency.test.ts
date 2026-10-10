import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialOrganizationForIdentityWithPlan } from "@/lib/tenant";
import { hasDatabase } from "./setup";

const suite = hasDatabase ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const suffix = randomUUID().slice(0, 8);
const clerkUserId = `clerk_test_onboarding_idempotency_${suffix}`;
const email = `onboarding_idempotency_${suffix}@test.local`;
let ownerClient: pg.Client;
let userId = "";

suite("onboarding workspace idempotency", () => {
  beforeAll(async () => {
    ownerClient = new pg.Client({ connectionString });
    await ownerClient.connect();
    await ownerClient.query("select app.upsert_local_user($1, $2, $3)", [clerkUserId, email, "Idempotency Owner"]);
    userId = (await ownerClient.query("select id from public.users where clerk_user_id = $1", [clerkUserId])).rows[0].id;
  });

  afterAll(async () => {
    if (!ownerClient) return;
    await ownerClient.query("delete from public.audit_logs where user_id = $1", [userId]).catch(() => {});
    await ownerClient.query("delete from public.organizations where id in (select org_id from public.organization_members where user_id = $1)", [userId]).catch(() => {});
    await ownerClient.query("delete from public.users where id = $1", [userId]).catch(() => {});
    await ownerClient.end().catch(() => {});
  });

  it("returns the same workspace for sequential and concurrent finalization", async () => {
    const first = await createInitialOrganizationForIdentityWithPlan({ kind: "clerk", clerkUserId }, "Idempotent Workspace", `idempotent-${suffix}`, "personal", "free");
    const second = await createInitialOrganizationForIdentityWithPlan({ kind: "clerk", clerkUserId }, "Idempotent Workspace", `idempotent-${suffix}`, "personal", "free");
    const concurrent = await Promise.all([
      createInitialOrganizationForIdentityWithPlan({ kind: "clerk", clerkUserId }, "Idempotent Workspace", `idempotent-${suffix}`, "personal", "free"),
      createInitialOrganizationForIdentityWithPlan({ kind: "clerk", clerkUserId }, "Idempotent Workspace", `idempotent-${suffix}`, "personal", "free"),
    ]);
    expect(second.orgId).toBe(first.orgId);
    expect(concurrent.map((result) => result.orgId)).toEqual([first.orgId, first.orgId]);
    expect((await ownerClient.query("select count(*)::int as n from public.organization_members where user_id = $1", [userId])).rows[0].n).toBe(1);
    expect((await ownerClient.query("select onboarding_workspace_id from public.users where id = $1", [userId])).rows[0].onboarding_workspace_id).toBe(first.orgId);
  });
});
