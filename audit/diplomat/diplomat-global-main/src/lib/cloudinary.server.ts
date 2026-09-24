import "@tanstack/react-start/server-only";
import { v2 as cloudinary } from "cloudinary";

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export function createSignedImageUpload() {
  const config = getCloudinaryConfig();
  if (!config) return null;
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  const timestamp = Math.floor(Date.now() / 1_000);
  const params = {
    timestamp,
    folder: "sleek-shop/products",
    resource_type: "image" as const,
  };
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder: params.folder,
    signature: cloudinary.utils.api_sign_request(
      { timestamp: params.timestamp, folder: params.folder },
      config.apiSecret,
    ),
  };
}

export function productImageUrl(publicId: string, width = 900) {
  const config = getCloudinaryConfig();
  if (!config) return null;
  cloudinary.config({ cloud_name: config.cloudName, secure: true });
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: "auto",
    quality: "auto",
    crop: "limit",
    width,
  });
}
