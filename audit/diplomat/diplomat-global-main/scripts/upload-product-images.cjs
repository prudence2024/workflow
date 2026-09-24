/**
 * Upload local product images to Cloudinary and create product_images records.
 * Run: node scripts/upload-product-images.cjs
 */
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const db = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Map of local image files to product slugs
const IMAGE_MAP = {
  "product-ultrawide.jpg": "apex-34-ultrawide",
  "product-camcorder.jpg": "lumina-4k-camcorder",
  "product-hub.jpg": "syncnode-10-port-hub",
  "product-pccase.jpg": "titan-flow-micro-atx",
  "product-portable.jpg": "ultraview-27-portable-4k",
  "product-printer.jpg": "officejet-pro-s1",
};

// Fallback for products without a direct image match
const CATEGORY_FALLBACK = {
  "Monitor": "product-ultrawide.jpg",
  "Gaming Monitor": "product-ultrawide.jpg",
  "Camera": "product-camcorder.jpg",
  "Computing": "product-hub.jpg",
};

async function main() {
  console.log("Starting product image upload...\n");

  // Get all active products
  const { data: products } = await db
    .from("products")
    .select("id, slug, name, categories(name)")
    .eq("status", "active");

  if (!products?.length) {
    console.log("No active products found");
    return;
  }

  const assetsDir = path.join(__dirname, "..", "src", "assets");
  let uploaded = 0;
  let skipped = 0;

  for (const product of products) {
    // Check if product already has images
    const { data: existing } = await db
      .from("product_images")
      .select("id")
      .eq("product_id", product.id)
      .limit(1);

    if (existing?.length) {
      console.log(`  SKIP: ${product.slug} (already has images)`);
      skipped++;
      continue;
    }

    // Find matching image file
    let imageName = IMAGE_MAP[product.slug + ".jpg"];
    if (!imageName) {
      // Try category-based fallback
      const categoryName = product.categories?.name;
      imageName = CATEGORY_FALLBACK[categoryName];
    }

    if (!imageName) {
      console.log(`  SKIP: ${product.slug} (no image found)`);
      skipped++;
      continue;
    }

    const imagePath = path.join(assetsDir, imageName);
    if (!fs.existsSync(imagePath)) {
      console.log(`  SKIP: ${product.slug} (image file not found: ${imageName})`);
      skipped++;
      continue;
    }

    console.log(`  UPLOADING: ${product.slug} ← ${imageName}`);

    try {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(imagePath, {
        folder: "diplomat-global/products",
        public_id: product.slug,
        overwrite: true,
        transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto" }],
      });

      // Create product_images record
      const { error } = await db.from("product_images").insert({
        product_id: product.id,
        cloudinary_public_id: result.public_id,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        alt_text: product.name,
        sort_order: 0,
      });

      if (error) {
        console.log(`    ERROR: ${error.message}`);
      } else {
        console.log(`    OK: ${result.secure_url.substring(0, 60)}...`);
        uploaded++;
      }
    } catch (err) {
      console.log(`    ERROR: ${err.message}`);
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped`);
}

main().catch(console.error);
