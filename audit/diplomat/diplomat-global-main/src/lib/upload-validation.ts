/**
 * Shared image upload validation for all Admin upload surfaces.
 *
 * Provider-enforced format restrictions and server-side verification of Cloudinary
 * resource metadata are the authoritative boundary. This client-side validation
 * provides immediate UX feedback before upload.
 */

import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_DIMENSION } from "@/lib/cloudinary-upload-policy";

export const MAX_FILE_SIZE_BYTES = IMAGE_UPLOAD_MAX_BYTES;
export const MAX_FILE_SIZE_MB = 5;
/**
 * Safety upper bound — prevents absurdly large images from consuming
 * excessive bandwidth/storage. Not a business requirement.
 * Recommended per asset type:
 *   Product images: 2000×2000px
 *   Hero slides: 1920×1080px
 *   Blog images: 1200×800px
 *   Avatars: 500×500px
 */
export const MAX_DIMENSION_PX = IMAGE_UPLOAD_MAX_DIMENSION;
export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const ALLOWED_FORMATS_LABEL = "JPEG, PNG, or WebP";

/**
 * Format file size for human-readable display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a single image file client-side.
 * Returns null if valid, or an error message string.
 */
export function validateImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    // 1. MIME type check
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.has("." + ext)) {
        resolve(
          `"${file.name}" (${formatFileSize(file.size)}) is not supported. Use ${ALLOWED_FORMATS_LABEL}.`,
        );
        return;
      }
    }

    // 2. File size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      resolve(`"${file.name}" is ${formatFileSize(file.size)} — maximum is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    // 3. Dimension check
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width > MAX_DIMENSION_PX || img.height > MAX_DIMENSION_PX) {
        resolve(
          `"${file.name}" is ${img.width}×${img.height}px — maximum is ${MAX_DIMENSION_PX}×${MAX_DIMENSION_PX}px.`,
        );
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(`"${file.name}" could not be read as an image.`);
    };
    img.src = objectUrl;
  });
}

/**
 * Validate multiple image files. Returns { errors, validFiles }.
 */
export async function validateImageFiles(
  files: FileList | File[],
): Promise<{ errors: string[]; validFiles: File[] }> {
  const errors: string[] = [];
  const validFiles: File[] = [];

  for (let i = 0; i < files.length; i++) {
    const err = await validateImageFile(files[i]);
    if (err) errors.push(err);
    else validFiles.push(files[i]);
  }

  return { errors, validFiles };
}
