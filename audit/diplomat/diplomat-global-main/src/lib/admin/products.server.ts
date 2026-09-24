import "@tanstack/react-start/server-only";
import { createDatabaseClient } from "../database.server";

// ── Types ──
export interface Product {
  id: string;
  category_id: string | null;
  slug: string;
  sku: string;
  name: string;
  tagline: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  condition: string;
  is_easy_buy: boolean;
  status: string;
  featured: boolean;
  is_new: boolean;
  in_stock: boolean;
  specifications: any;
  created_at: string;
  updated_at: string;
  // Joined
  category_name?: string | null;
  category_slug?: string | null;
}

export interface ProductImage {
  id: string;
  product_id: string;
  cloudinary_public_id: string;
  secure_url: string;
  width: number | null;
  height: number | null;
  alt_text: string;
  sort_order: number;
}

export interface InventoryRecord {
  product_id: string;
  quantity: number;
  reserved: number;
  low_stock_threshold: number;
  updated_at: string;
}

// ── Read ──
export async function getProducts(options?: {
  status?: string;
  category_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("products")
    .select("*, categories!products_category_id_fkey(name, slug)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options?.status) query = query.eq("status", options.status);
  if (options?.category_id) query = query.eq("category_id", options.category_id);
  if (options?.search) {
    query = query.or(
      `name.ilike.%${options.search}%,sku.ilike.%${options.search}%,tagline.ilike.%${options.search}%`,
    );
  }
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return { products: (data || []) as any[], total: count || 0 };
}

export async function getProductBySlug(slug: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("products")
    .select("*, categories!products_category_id_fkey(name, slug)")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`Product not found: ${error.message}`);
  return data as any;
}

export async function getProductById(id: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("products")
    .select("*, categories!products_category_id_fkey(name, slug)")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Product not found: ${error.message}`);
  return data as any;
}

export async function getProductImages(productId: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order");
  if (error) throw new Error(`Failed to fetch images: ${error.message}`);
  return data as ProductImage[];
}

export async function getProductCount() {
  const db = createDatabaseClient();
  const { count, error } = await db.from("products").select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count products: ${error.message}`);
  return count || 0;
}

// ── Create ──
export async function createProduct(input: {
  category_id?: string;
  slug: string;
  sku: string;
  name: string;
  tagline?: string;
  description?: string;
  price: number;
  compare_at_price?: number;
  condition?: string;
  is_easy_buy?: boolean;
  status?: string;
  featured?: boolean;
  is_new?: boolean;
  in_stock?: boolean;
  specifications?: any;
}) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("products")
    .insert({
      ...input,
      specifications: input.specifications || "[]",
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create product: ${error.message}`);

  // Auto-create inventory record
  await db.from("inventory").insert({
    product_id: data.id,
    quantity: 0,
    reserved: 0,
    low_stock_threshold: 3,
  });

  return data as Product;
}

// ── Update ──
export async function updateProduct(
  id: string,
  input: Partial<{
    category_id: string;
    slug: string;
    name: string;
    tagline: string;
    description: string;
    price: number;
    compare_at_price: number;
    condition: string;
    is_easy_buy: boolean;
    status: string;
    featured: boolean;
    is_new: boolean;
    in_stock: boolean;
    specifications: any;
  }>,
) {
  const db = createDatabaseClient();
  const { data, error } = await db.from("products").update(input).eq("id", id).select().single();
  if (error) throw new Error(`Failed to update product: ${error.message}`);
  return data as Product;
}

// ── Delete (soft: archive) ──
export async function archiveProduct(id: string) {
  return updateProduct(id, { status: "archived" });
}

// ── Inventory ──
export async function getProductInventory(productId: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("inventory")
    .select("*")
    .eq("product_id", productId)
    .single();
  if (error) return null;
  return data as InventoryRecord;
}

export async function updateInventory(
  productId: string,
  input: Partial<{
    quantity: number;
    reserved: number;
    low_stock_threshold: number;
  }>,
) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("inventory")
    .update(input)
    .eq("product_id", productId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update inventory: ${error.message}`);
  return data as InventoryRecord;
}

export async function getInventoryWithProducts(options?: {
  search?: string;
  low_stock?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = createDatabaseClient();
  let query = db
    .from("inventory")
    .select("*, products!inner(id, name, sku, slug, in_stock)", { count: "exact" })
    .order("quantity", { ascending: true });

  if (options?.search) {
    query = query.or(
      "products.name.ilike.%" + options.search + "%,products.sku.ilike.%" + options.search + "%",
    );
  }
  if (options?.low_stock) {
    // Low stock filter applied in JS below
  }
  if (options?.limit)
    query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch inventory: ${error.message}`);

  let items = (data || []) as any[];
  if (options?.low_stock) {
    items = items.filter((i: any) => i.quantity <= i.low_stock_threshold);
  }

  return { items, total: count || 0 };
}
