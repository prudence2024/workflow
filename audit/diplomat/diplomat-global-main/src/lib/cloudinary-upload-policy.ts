import { z } from "zod";

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_DIMENSION = 4_000;
export const CLOUDINARY_ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;
export const CLOUDINARY_ALLOWED_FORMATS_PARAM = CLOUDINARY_ALLOWED_FORMATS.join(",");

export function buildCloudinaryUploadParameters(timestamp: number, folder: string) {
  return {
    timestamp,
    folder,
    allowed_formats: CLOUDINARY_ALLOWED_FORMATS_PARAM,
  } as const;
}

const allowedFormatSet = new Set<string>(CLOUDINARY_ALLOWED_FORMATS);

export interface CloudinaryAssetMetadata {
  public_id?: unknown;
  secure_url?: unknown;
  resource_type?: unknown;
  format?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  folder?: unknown;
  asset_folder?: unknown;
}

export interface VerifiedCloudinaryAsset {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

export type CloudinaryAssetValidation =
  | { ok: true; asset: VerifiedCloudinaryAsset }
  | { ok: false; message: string; ownedByExpectedFolder: boolean };

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isCloudinaryImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.hostname === "res.cloudinary.com" && url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export function formatUploadBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateCloudinaryAssetMetadata(
  metadata: CloudinaryAssetMetadata,
  expectedFolder: string,
): CloudinaryAssetValidation {
  const publicId = typeof metadata.public_id === "string" ? metadata.public_id : "";
  const providerFolder =
    typeof metadata.asset_folder === "string"
      ? metadata.asset_folder
      : typeof metadata.folder === "string"
        ? metadata.folder
        : "";
  const ownedByExpectedFolder =
    providerFolder === expectedFolder || publicId.startsWith(`${expectedFolder}/`);

  if (!publicId || !ownedByExpectedFolder) {
    return {
      ok: false,
      message: "The uploaded image is not in the authorized Cloudinary folder.",
      ownedByExpectedFolder,
    };
  }
  if (metadata.resource_type !== "image") {
    return {
      ok: false,
      message: "Cloudinary did not identify the upload as an image.",
      ownedByExpectedFolder,
    };
  }

  const format = typeof metadata.format === "string" ? metadata.format.toLowerCase() : "";
  if (!allowedFormatSet.has(format)) {
    return {
      ok: false,
      message: "Only JPEG, PNG, and WebP images are allowed.",
      ownedByExpectedFolder,
    };
  }
  if (!isPositiveFiniteNumber(metadata.bytes)) {
    return {
      ok: false,
      message: "Cloudinary did not return a valid image size.",
      ownedByExpectedFolder,
    };
  }
  if (metadata.bytes > IMAGE_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message: `The uploaded image is ${formatUploadBytes(metadata.bytes)}; the maximum allowed size is ${formatUploadBytes(IMAGE_UPLOAD_MAX_BYTES)}.`,
      ownedByExpectedFolder,
    };
  }
  if (!isPositiveFiniteNumber(metadata.width) || !isPositiveFiniteNumber(metadata.height)) {
    return {
      ok: false,
      message: "Cloudinary did not return valid image dimensions.",
      ownedByExpectedFolder,
    };
  }
  if (metadata.width > IMAGE_UPLOAD_MAX_DIMENSION || metadata.height > IMAGE_UPLOAD_MAX_DIMENSION) {
    return {
      ok: false,
      message: `The uploaded image is ${metadata.width}×${metadata.height}px; the maximum allowed dimensions are ${IMAGE_UPLOAD_MAX_DIMENSION}×${IMAGE_UPLOAD_MAX_DIMENSION}px.`,
      ownedByExpectedFolder,
    };
  }

  let secureUrl: URL;
  try {
    secureUrl = new URL(typeof metadata.secure_url === "string" ? metadata.secure_url : "");
  } catch {
    return {
      ok: false,
      message: "Cloudinary returned an invalid image URL.",
      ownedByExpectedFolder,
    };
  }
  if (secureUrl.protocol !== "https:" || secureUrl.hostname !== "res.cloudinary.com") {
    return {
      ok: false,
      message: "Cloudinary returned an unauthorized image URL.",
      ownedByExpectedFolder,
    };
  }

  return {
    ok: true,
    asset: {
      publicId,
      secureUrl: secureUrl.toString(),
      format,
      bytes: metadata.bytes,
      width: metadata.width,
      height: metadata.height,
    },
  };
}

/**
 * Zod schema for admin content fields that persist a Cloudinary image URL
 * (blog cover, hero slide, avatar). Upload-time executables are already
 * blocked at the provider by the signed `allowed_formats` allowlist; this
 * guard ensures only verified provider URLs enter admin content records.
 */
export const cloudinaryImageUrlSchema = z
  .string()
  .max(2000)
  .refine(isCloudinaryImageUrl, "Image must be an uploaded Cloudinary URL.");

/**
 * Safety check for admin-managed CTA/navigation links (hero slides, CMS
 * buttons). Allowlist: internal relative routes and https: only. Rejects
 * javascript:, data:, vbscript:, protocol-relative (//host), and every
 * other scheme — including URL-encoded variants, because the check runs on
 * the decoded value (Zod/query parsing has already decoded %3A etc.).
 */
export function isSafeCtaLink(link: string): boolean {
  const decoded = link
    .trim()
    .replace(/%(2f|5c)/gi, "/")
    .replace(/%(3a|09|0a|0d)/gi, (m) =>
      m.toLowerCase() === "%3a" ? ":" : "",
    );
  if (/(^\s*(javascript|data|vbscript)\s*:)/i.test(decoded)) return false;
  if (/^(\\|\/\/)/.test(decoded)) return false; // leading backslash or protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) && !/^https?:/i.test(decoded)) return false;
  return true;
}

export const safeCtaLinkSchema = z
  .string()
  .max(2000)
  .refine(isSafeCtaLink, "Link must be an internal route or an https:// URL.");
