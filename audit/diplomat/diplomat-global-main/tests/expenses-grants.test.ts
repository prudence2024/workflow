import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Expenses grant + architecture contract.
 *
 * Owner-reported runtime defect: "permission denied for table expenses" when
 * adding an expense in authenticated Admin. Root cause (proven live):
 * public.expenses was created after the baseline service_role GRANT sweep and
 * its migration added RLS policies only — RLS policies never confer table
 * privileges — so the server-only privileged client was denied all operations.
 *
 * These tests pin the contract so the grant cannot silently regress and the
 * browser-role revocation posture is preserved.
 */

const MIGRATION = "20260918120000_expenses_service_role_grant.sql";

describe("expenses grant migration contract", () => {
  const sql = readFileSync(join("supabase", "migrations", MIGRATION), "utf8");

  test("migration file exists and grants the four CRUD privileges to service_role", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.expenses TO service_role/);
  });

  test("migration grants nothing to browser roles (least privilege preserved)", () => {
    expect(sql).not.toMatch(/GRANT[^;]*\bTO (anon|authenticated)\b/);
    expect(sql).not.toMatch(/GRANT[^;]*TO PUBLIC/);
  });

  test("migration documents an explicit rollback that is the exact inverse of the grant", () => {
    // Rollback must revoke precisely what was granted (REVOKE ALL would also
    // drop any future column-level grant and is no longer used here).
    expect(sql).toMatch(/REVOKE SELECT, INSERT, UPDATE, DELETE ON public\.expenses FROM service_role;/);
    expect(sql).not.toMatch(/REVOKE ALL ON public\.expenses FROM service_role/);
  });
});

describe("expenses server boundary contract", () => {
  test("no browser-side file touches the expenses table", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const roots = [join("src", "components"), join("src", "routes")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|ts)$/.test(entry.name) && fs.readFileSync(full, "utf8").match(/from\(\s*["']expenses["']/)) offenders.push(full);
      }
    };
    for (const r of roots) if (fs.existsSync(r)) walk(r);
    expect(offenders).toEqual([]);
  });

  test("every expenses DB operation in server code goes through requirePermission + server-only client", async () => {
    const src = readFileSync(join("src", "lib", "admin", "server-fns.ts"), "utf8");
    // Extract each expenses serverFn block and assert ordering: requirePermission before db use.
    const blocks = src.split("export const ").filter((b) => b.includes('.from("expenses")'));
    expect(blocks.length).toBeGreaterThanOrEqual(4); // list, create, delete, update
    for (const block of blocks) {
      const permIdx = block.search(/requirePermission\("(expenses|analytics)\./);
      const dbIdx = block.indexOf('.from("expenses")');
      expect(permIdx, "requirePermission must appear before the expenses query").toBeGreaterThanOrEqual(0);
      expect(permIdx).toBeLessThan(dbIdx);
    }
    // The shared client factory is the server-only module (imported with server-only guard).
    const dbServer = readFileSync(join("src", "lib", "database.server.ts"), "utf8");
    expect(dbServer).toContain('import "@tanstack/react-start/server-only"');
  });
});
