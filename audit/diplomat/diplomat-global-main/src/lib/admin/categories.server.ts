import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getCategories() {
  const db = createDatabaseClient();
  const { data, error } = await db.from("categories").select("*").order("sort_order").order("name");
  if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
  return data as Category[];
}

export async function getCategoryById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("categories").select("*").eq("id", id).single();
  if (error) throw new Error(`Category not found: ${error.message}`);
  return data as Category;
}

export async function createCategory(input: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parent_id?: string;
  sort_order?: number;
}) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("categories").insert(input).select().single();
  if (error) throw new Error(`Failed to create category: ${error.message}`);
  return data as Category;
}

export async function updateCategory(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    description: string;
    icon: string;
    parent_id: string;
    sort_order: number;
    active: boolean;
  }>,
) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("categories").update(input).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update category: ${error.message}`);
  return data as Category;
}

export async function deleteCategory(id: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete category: ${error.message}`);
}

export async function getCategoryProductCount(categoryId: string) {
  const db = createDatabaseClient();
  const { count } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  return count || 0;
}
