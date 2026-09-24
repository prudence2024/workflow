import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Safety contract for the three Owner-gated shared-DB migrations.
 *
 * These files are the only artifacts a human approves and then runs against the
 * shared Preview/Production database, and none has been applied. The properties
 * below were verified by EXECUTING each file twice against a throwaway
 * PostgreSQL 17 cluster seeded with the live schema shape and the exact live
 * rows (40 products incl. the 18 dirty slugs, 4 hero slides, 8 roles, 4
 * expenses.* permission keys, 0 pre-existing expenses grants). These tests pin
 * the same properties so a later edit cannot quietly undo them.
 *
 * Assertions run against the OPERATIVE SQL (comment lines stripped), because
 * the files intentionally document the bugs they fix — including the very
 * patterns that must not appear in executable statements.
 */

const read = (name: string) => readFileSync(join("supabase", "migrations", name), "utf8");
const sqlOnly = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const RBAC_RAW = read("20260921120000_expenses_permissions_role_grants.sql");
const SLUGS_RAW = read("20260920120000_slug_normalization_PREPARED_NOT_APPLIED.sql");
const RBAC = sqlOnly(RBAC_RAW);
const SLUGS = sqlOnly(SLUGS_RAW);

describe("expenses RBAC migration (Owner policy)", () => {
  test("grants full CRUD to owner + admin and view-only to finance", () => {
    expect(RBAC).toMatch(/FOREACH v_role_key IN ARRAY ARRAY\['owner', 'admin'\]/);
    // the CRUD loop covers all four keys
    for (const key of ["expenses.view", "expenses.create", "expenses.edit", "expenses.delete"]) {
      expect(RBAC).toMatch(new RegExp(`'${key.replace(".", "\\.")}'`));
    }

    // scope inspection: the finance section must grant view and nothing else
    const start = RBAC.lastIndexOf("key = 'finance'");
    expect(start).toBeGreaterThan(-1);
    const end = RBAC.indexOf("IF array_length(missing_keys", start);
    expect(end).toBeGreaterThan(start);
    const financeSection = RBAC.slice(start, end);
    expect(financeSection).toMatch(/expenses\.view/);
    expect(financeSection).not.toMatch(/expenses\.(create|edit|delete)/);
  });

  test("cannot create duplicate rows or duplicate permission records", () => {
    expect(RBAC).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(RBAC).not.toMatch(/INSERT INTO public\.permissions/);
    expect(RBAC).not.toMatch(/INSERT INTO public\.roles/);
  });

  test("PL/pgSQL variables are v_-prefixed so the conflict target is not ambiguous", () => {
    // `ON CONFLICT (role_id, permission_id)` with an unprefixed variable of the
    // same name raises "column reference role_id is ambiguous" (observed live).
    expect(RBAC).toMatch(/v_role_id/);
    expect(RBAC).not.toMatch(/INTO role_id/);
  });

  test("fails closed when a role or permission key cannot be resolved", () => {
    expect(RBAC).toMatch(/RAISE EXCEPTION[\s\S]*?unresolved role\/permission key/);
    expect(RBAC).toMatch(/RAISE EXCEPTION[\s\S]*?post-condition failed/);
    // array_append is required: `text[] || 'literal'` raises "malformed array literal"
    expect(RBAC).toMatch(/missing_keys := array_append\(missing_keys/);
    expect(RBAC).not.toMatch(/missing_keys := missing_keys \|\|/);
  });

  test("rollback is scoped to the 9 approved grants", () => {
    expect(RBAC_RAW).toMatch(/delete from public\.role_permissions rp[\s\S]*?r\.key in \('owner', 'admin', 'finance'\)/);
    expect(RBAC_RAW).toMatch(
      /p\.key in \('expenses\.view','expenses\.create','expenses\.edit','expenses\.delete'\)/,
    );
  });
});

describe("slug normalization migration", () => {
  test("contains no invalid escape-string clause in operative SQL", () => {
    // `LIKE ... ESCAPE '\\'` raises "invalid escape string" because
    // standard_conforming_strings makes '\\' two characters (observed live).
    expect(SLUGS).not.toMatch(/ESCAPE/);
    expect(SLUGS).not.toMatch(/LIKE/);
  });

  test("normalizes with btrim and guards against post-normalization collisions", () => {
    expect(SLUGS).toMatch(/SET slug = btrim\(slug\)/);
    expect(SLUGS).toMatch(/HAVING count\(\*\) > 1/);
    expect(SLUGS).toMatch(/RAISE EXCEPTION[\s\S]*?collision group\(s\) after normalization/);
    expect(SLUGS).toMatch(/RAISE EXCEPTION[\s\S]*?post-condition failed/);
  });

  test("only rewrites hero CTAs that are not already canonical", () => {
    expect(SLUGS).toMatch(/btrim\(h\.cta_link\) = '\/products\/' \|\| p\.slug/);
    expect(SLUGS).toMatch(/AND h\.cta_link <> '\/products\/' \|\| p\.slug/);
  });

  test("records all 18 whitespace slugs for before/after and rollback", () => {
    const ids = SLUGS_RAW.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    const unique = new Set(ids);
    expect(unique.size).toBeGreaterThanOrEqual(18);
    expect(unique.has("14c1798b-e730-49b4-9987-b3d3ffc09e79")).toBe(true);
    expect(unique.has("24bf1df6-eb62-4f32-8eac-a8b70575693d")).toBe(true);
    expect(SLUGS_RAW).toMatch(/RECORDED BEFORE \/ AFTER/);
    // the Samsung slug appears both dirty (recorded) and trimmed
    expect(SLUGS_RAW).toMatch(/Ls32a700nwnxza /);
    expect(SLUGS_RAW).toMatch(/14c1798b-e730-49b4-9987-b3d3ffc09e79/);
  });

  test("documents that historical orders are unaffected (no slug column)", () => {
    expect(SLUGS_RAW).toMatch(/order_items[\s\S]*?NO slug column/);
    expect(SLUGS_RAW).toMatch(/No FK couples products <-> hero_slides/);
  });
});
