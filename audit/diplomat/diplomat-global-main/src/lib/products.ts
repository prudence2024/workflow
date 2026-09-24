import { uniqueProductImages } from "./product-gallery";
import type { InventoryState } from "./inventory-lifecycle";

export type Category = "Computing" | "Monitor" | "Gaming Monitor" | "Camera" | "Printers & Scanner";

export const CATEGORIES: Category[] = [
  "Computing",
  "Monitor",
  "Gaming Monitor",
  "Camera",
  "Printers & Scanner",
];

export interface Product {
  id: string;
  sku?: string;
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  price: number;
  compareAt?: number;
  image: string;
  images?: string[];
  imageAlts?: string[];
  inStock: boolean;
  /** Display stock state from the authoritative inventory row (quantity + threshold). */
  stockState?: InventoryState;
  /** Available quantity when an inventory row exists; null/undefined otherwise. */
  stockQuantity?: number | null;
  featured?: boolean;
  isNew?: boolean;
  description?: string;
  specs?: Array<{ label: string; value: string }>;
}

/**
 * Returns category-specific spec labels.
 * Each product only gets the specs relevant to its category.
 * In the database the admin will manage which spec fields apply per category;
 * here we return the defaults for static rendering.
 */
export const CATEGORY_SPEC_FIELDS: Record<Category, string[]> = {
  Monitor: ["Display", "Resolution", "Refresh Rate", "Panel Type", "Connectivity"],
  "Gaming Monitor": ["Display", "Resolution", "Refresh Rate", "Response Time", "Adaptive Sync"],
  Camera: ["Sensor", "Resolution", "Video", "Audio", "Storage"],
  Computing: ["Type", "Ports", "Material", "Cooling", "Form Factor"],
  "Printers & Scanner": ["Function", "Print Speed", "Resolution", "Connectivity", "Paper Size"],
};

export const formatNaira = (n: number) => "₦" + n.toLocaleString("en-NG");

export const getProductDescription = (product: Product) =>
  product.description ??
  `${product.tagline}. A dependable ${product.category.toLowerCase()} solution selected by Diplomat Global for Nigerian homes, creators and businesses, with local support and nationwide delivery.`;

export const getProductSpecs = (product: Product) =>
  product.specs ?? [
    { label: "Category", value: product.category },
    { label: "Availability", value: product.inStock ? "In stock" : "Sold out" },
    { label: "Warranty", value: "12 months" },
    { label: "Delivery", value: "Nationwide" },
  ];

export const getProductImages = uniqueProductImages;
