import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogSearchFilter,
  centeredCategoryScrollLeft,
  createCategoryRecord,
  deleteCategoryRecord,
  loadCategoryPage,
  parseCategorySelection,
  updateCategoryRecord,
  type CategoryRow,
  type DatabaseResult,
} from "../src/lib/category-lifecycle";

function success<T>(data: T, count?: number): DatabaseResult<T> {
  return { data, error: null, count };
}

describe("category lifecycle", () => {
  it("creates exactly one active row and keeps an empty category visible", async () => {
    const rows: CategoryRow[] = [];
    const insert = vi.fn(async (input) => {
      const row: CategoryRow = {
        id: "11111111-1111-4111-8111-111111111111",
        sort_order: 0,
        products: [],
        ...input,
      };
      rows.push(row);
      return success(row);
    });

    const created = await createCategoryRecord(
      { name: "  Work Stations ", slug: " WORK-STATIONS ", description: "  Desks  " },
      insert,
    );
    const listed = await loadCategoryPage({ page: 1, pageSize: 10 }, async () =>
      success(rows, rows.length),
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(created).toMatchObject({
      ok: true,
      category: { name: "Work Stations", slug: "work-stations", active: true, productCount: 0 },
    });
    expect(listed).toMatchObject({ ok: true, total: 1 });
    expect(listed.categories[0]).toMatchObject({ slug: "work-stations", productCount: 0 });
  });

  it("does not turn a database failure into a legitimate empty result", async () => {
    const listed = await loadCategoryPage({}, async () => ({
      data: null,
      count: null,
      error: { message: "connection unavailable" },
    }));

    expect(listed).toMatchObject({
      ok: false,
      categories: [],
      message: expect.stringContaining("could not be loaded"),
    });
  });

  it("rejects duplicate create without reporting success or adding a row", async () => {
    const insert = vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "duplicate key violates unique constraint" },
    }));

    const result = await createCategoryRecord({ name: "Displays", slug: "DISPLAYS" }, insert);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, message: "A category with this slug already exists." });
  });

  it("supports rename, reorder, disable, enable, and delete with affected-row proof", async () => {
    let row: CategoryRow | null = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Cameras",
      slug: "cameras",
      sort_order: 1,
      active: true,
      products: [],
    };
    const update = async (patch: Partial<CategoryRow>) => {
      row = row ? { ...row, ...patch } : null;
      return success(row);
    };

    expect(await updateCategoryRecord({ name: "Digital Cameras" }, update)).toMatchObject({
      ok: true,
      category: { name: "Digital Cameras" },
    });
    expect(await updateCategoryRecord({ sort_order: 9 }, update)).toMatchObject({
      ok: true,
      category: { sort_order: 9 },
    });
    expect(await updateCategoryRecord({ active: false }, update)).toMatchObject({
      ok: true,
      category: { active: false },
    });
    expect(await updateCategoryRecord({ active: true }, update)).toMatchObject({
      ok: true,
      category: { active: true },
    });
    const deleted = await deleteCategoryRecord(async () => {
      const prior = row;
      row = null;
      return success(prior);
    });
    expect(deleted).toMatchObject({ ok: true, category: { slug: "cameras" } });
    expect(row).toBeNull();
  });

  it("requires an affected row before update or delete can report success", async () => {
    expect(await updateCategoryRecord({ active: false }, async () => success(null))).toEqual({
      ok: false,
      message: "Category not found.",
    });
    expect(await deleteCategoryRecord(async () => success(null))).toEqual({
      ok: false,
      message: "Category not found.",
    });
  });
});

describe("category navigation", () => {
  it("normalizes URL selection and removes duplicates", () => {
    expect(parseCategorySelection(" laptops,monitors,laptops ")).toEqual(["laptops", "monitors"]);
  });

  it("centers only the horizontal category container and clamps its bounds", () => {
    expect(centeredCategoryScrollLeft(320, 900, 500, 100)).toBe(390);
    expect(centeredCategoryScrollLeft(320, 900, 10, 100)).toBe(0);
    expect(centeredCategoryScrollLeft(320, 900, 850, 100)).toBe(580);
  });

  it("builds a bounded quoted name/SKU filter for PostgREST grammar characters", () => {
    expect(buildCatalogSearchFilter('  Laptop,sku.eq.hijack "pro"  ')).toBe(
      'name.ilike."%Laptop,sku.eq.hijack \\"pro\\"%",sku.ilike."%Laptop,sku.eq.hijack \\"pro\\"%"',
    );
    expect(buildCatalogSearchFilter("\u0000\u0007")).toBeNull();
    expect(buildCatalogSearchFilter("x".repeat(150))).toContain(`%${"x".repeat(100)}%`);
  });
});
