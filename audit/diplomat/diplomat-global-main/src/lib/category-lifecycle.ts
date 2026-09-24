export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  sort_order: number;
  active: boolean;
  products?: Array<{ id: string }> | null;
}

export interface CategoryView extends Omit<CategoryRow, "products"> {
  productCount: number;
}

export interface DatabaseFailure {
  message: string;
  code?: string;
}

export interface DatabaseResult<T> {
  data: T | null;
  error: DatabaseFailure | null;
  count?: number | null;
}

export interface CategoryPageInput {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface CategoryCreateInput {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
}

export interface CategoryUpdateInput {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  active?: boolean;
}

export type CategoryMutationResult =
  { ok: true; category: CategoryView } | { ok: false; message: string };

function categoryView(row: CategoryRow): CategoryView {
  const { products, ...category } = row;
  return { ...category, productCount: products?.length ?? 0 };
}

function duplicateCategoryError(error: DatabaseFailure): boolean {
  return error.code === "23505" || /duplicate|unique/i.test(error.message);
}

export async function loadCategoryPage(
  input: CategoryPageInput,
  query: (normalized: Required<CategoryPageInput>) => Promise<DatabaseResult<CategoryRow[]>>,
) {
  const normalized = {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 10,
    search: input.search?.trim() ?? "",
  };
  const result = await query(normalized);
  if (result.error) {
    return {
      ok: false as const,
      categories: [] as CategoryView[],
      total: 0,
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalPages: 0,
      message: "Categories could not be loaded. Please retry.",
    };
  }

  const total = result.count ?? result.data?.length ?? 0;
  return {
    ok: true as const,
    categories: (result.data ?? []).map(categoryView),
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    totalPages: Math.ceil(total / normalized.pageSize),
  };
}

export async function createCategoryRecord(
  input: CategoryCreateInput,
  insert: (
    category: CategoryCreateInput & { active: true },
  ) => Promise<DatabaseResult<CategoryRow>>,
): Promise<CategoryMutationResult> {
  const normalized = {
    ...input,
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    description: input.description?.trim(),
    icon: input.icon?.trim(),
    active: true as const,
  };
  const result = await insert(normalized);
  if (result.error) {
    return {
      ok: false,
      message: duplicateCategoryError(result.error)
        ? "A category with this slug already exists."
        : "Failed to create category.",
    };
  }
  if (!result.data) {
    return { ok: false, message: "The category insert could not be confirmed." };
  }
  return { ok: true, category: categoryView(result.data) };
}

export async function updateCategoryRecord(
  input: CategoryUpdateInput,
  update: (category: CategoryUpdateInput) => Promise<DatabaseResult<CategoryRow>>,
): Promise<CategoryMutationResult> {
  const normalized = {
    ...input,
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.slug === undefined ? {} : { slug: input.slug.trim().toLowerCase() }),
    ...(input.description === undefined ? {} : { description: input.description.trim() }),
    ...(input.icon === undefined ? {} : { icon: input.icon.trim() }),
  };
  const result = await update(normalized);
  if (result.error) {
    return {
      ok: false,
      message: duplicateCategoryError(result.error)
        ? "A category with this slug already exists."
        : "Failed to update category.",
    };
  }
  if (!result.data) return { ok: false, message: "Category not found." };
  return { ok: true, category: categoryView(result.data) };
}

export async function deleteCategoryRecord(
  remove: () => Promise<DatabaseResult<CategoryRow>>,
): Promise<CategoryMutationResult> {
  const result = await remove();
  if (result.error) return { ok: false, message: "Failed to delete category." };
  if (!result.data) return { ok: false, message: "Category not found." };
  return { ok: true, category: categoryView(result.data) };
}

export function parseCategorySelection(value?: string): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean),
    ),
  ];
}

export function centeredCategoryScrollLeft(
  containerWidth: number,
  contentWidth: number,
  itemOffsetLeft: number,
  itemWidth: number,
): number {
  const centered = itemOffsetLeft - (containerWidth - itemWidth) / 2;
  return Math.max(0, Math.min(centered, Math.max(0, contentWidth - containerWidth)));
}

export function buildCatalogSearchFilter(value: string): string | null {
  const normalized = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, 100);
  if (!normalized) return null;
  const quoted = normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `name.ilike."%${quoted}%",sku.ilike."%${quoted}%"`;
}
