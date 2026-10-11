import "server-only";
import { createHash } from "node:crypto";
import { newId } from "@/lib/id";
// NOTE: no node:fs / node:path imports here on purpose. The filesystem is
// only reachable through the local dev driver, which lazy-loads those
// modules at call time — a static import would break Cloudflare Workers,
// where the module graph must stay free of filesystem access.
import { EMPTY_PAYLOAD_SHA256, payloadSha256, signRequest } from "@/lib/sigv4";

/**
 * File storage.
 *
 * Cloudflare R2 is the production store for uploaded bytes (imports, exports,
 * documents). Cloudinary remains the store for *images* only, because it does
 * the transform/responsive work we would otherwise have to build.
 *
 * Two rules this module enforces rather than documents:
 *
 *   1. Bytes never go into PostgreSQL. Only a storage key is recorded.
 *   2. There is no silent local fallback in production. A misconfigured
 *      deployment raises instead of writing customer uploads to a container
 *      filesystem that disappears (or leaks between instances) without warning.
 *
 * The local filesystem driver exists for development and for the test suite.
 */

export type StorageDriver = "r2" | "local";

export type StoredObject = {
  key: string;
  sizeBytes: number;
  driver: StorageDriver;
};

type NativeR2Bucket = {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
};

async function nativeR2Bucket(): Promise<NativeR2Bucket | null> {
  // The Cloudflare binding adapter is loaded only by the retained Worker
  // fallback. Netlify's normal Node runtime never imports OpenNext or a
  // Cloudflare global while handling an application request.
  if (process.env.DATABASE_RUNTIME !== "edge") return null;
  try {
    const { getCloudflareR2Bucket } = await import("@/lib/cloudflare-r2");
    return getCloudflareR2Bucket();
  } catch {
    return null;
  }
}

export function isR2Configured(): boolean {
  if (process.env.DATABASE_RUNTIME === "edge") return true;
  return Boolean(
    (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT) &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function r2Endpoint(): { origin: string; host: string } {
  const configured = process.env.R2_ENDPOINT?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error("R2_ENDPOINT must use HTTPS");
    return { origin: url.origin, host: url.host };
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2_ACCOUNT_ID or R2_ENDPOINT is not configured");
  return { origin: `https://${accountId}.r2.cloudflarestorage.com`, host: `${accountId}.r2.cloudflarestorage.com` };
}

export function activeDriver(): StorageDriver {
  if (isR2Configured()) return "r2";
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "R2 is not configured. Refusing to store uploads on the local filesystem in production — " +
        "set R2_ACCOUNT_ID or R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.",
    );
  }
  return "local";
}

/** Filesystem access, loaded only when the local dev driver actually runs. */
async function localFs() {
  const [{ mkdir, readFile, writeFile }, { default: path }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  return { mkdir, readFile, writeFile, root: path.join(process.cwd(), ".storage", "uploads"), path };
}

/** Tenant-prefixed key so one workspace can never address another's object. */
function objectKey(orgId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `org/${orgId}/${newId()}-${safe}`;
}

export async function saveBuffer(
  orgId: string,
  fileName: string,
  data: Buffer,
  contentType = "application/octet-stream",
): Promise<StoredObject> {
  const driver = activeDriver();
  const key = objectKey(orgId, fileName);

  if (driver === "r2") {
    const bucket = await nativeR2Bucket();
    if (bucket) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    } else {
      await r2Request("PUT", key, data, contentType);
    }
    return { key, sizeBytes: data.byteLength, driver };
  }

  const { mkdir, writeFile, root, path } = await localFs();
  const full = path.join(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { key, sizeBytes: data.byteLength, driver };
}

export async function readStoredFile(key: string): Promise<Buffer> {
  const driver = activeDriver();
  if (driver === "r2") {
    const bucket = await nativeR2Bucket();
    if (bucket) {
      const object = await bucket.get(key);
      if (!object) throw new Error("Stored upload was not found");
      return Buffer.from(await object.arrayBuffer());
    }
    const res = await r2Request("GET", key);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFile, root, path } = await localFs();
  return readFile(path.join(root, key));
}

export async function deleteStoredFile(key: string): Promise<void> {
  const driver = activeDriver();
  if (driver === "r2") {
    const bucket = await nativeR2Bucket();
    if (bucket) await bucket.delete(key);
    else await r2Request("DELETE", key);
  }
}

/**
 * Short-lived, signed download URL for the browser. R2 buckets stay private;
 * the browser never receives credentials.
 */
/**
 * Presign a GET so a browser can fetch one private object for a short window.
 *
 * A complete presigned URL needs the X-Amz-* query parameters to be part of the
 * signed canonical request — a URL carrying only a Signature is rejected by S3,
 * so the whole query string is built and signed here.
 */
export function signedDownloadUrl(key: string, expiresInSeconds = 300): string {
  if (!isR2Configured()) {
    throw new Error("signedDownloadUrl requires R2 configuration");
  }
  const endpoint = r2Endpoint();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const bucket = process.env.R2_BUCKET!;
  const host = endpoint.host;
  const requestPath = `/${bucket}/${key}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(expiresInSeconds, 1), 604800)),
    "X-Amz-SignedHeaders": "host",
  };

  const signed = signRequest({
    method: "GET",
    host,
    path: requestPath,
    query,
    headers: {},
    payloadHash: "UNSIGNED-PAYLOAD",
    accessKeyId,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
    now,
  });

  const signature = /Signature=([0-9a-f]+)/.exec(signed.authorization)?.[1];
  if (!signature) throw new Error("could not extract signature");

  const queryString = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");

  return `${endpoint.origin}${requestPath}?${queryString}&X-Amz-Signature=${signature}`;
}

async function r2Request(
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const endpoint = r2Endpoint();
  const bucket = process.env.R2_BUCKET!;
  const host = endpoint.host;
  const requestPath = `/${bucket}/${key}`;
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = body ? payloadSha256(payload) : EMPTY_PAYLOAD_SHA256;

  const headers: Record<string, string> = {
    "content-type": contentType ?? "application/octet-stream",
  };
  if (body) headers["content-length"] = String(payload.byteLength);

  const signedHeaders = signRequest({
    method,
    host,
    path: requestPath,
    headers,
    payloadHash,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
  });

  const res = await fetch(`${endpoint.origin}${requestPath}`, {
    method,
    headers: signedHeaders,
    body: body ? new Uint8Array(payload) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 ${method} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Cloudinary — images only
// ---------------------------------------------------------------------------
export type CloudinaryImage = { publicId: string; secureUrl: string; width: number; height: number };

/**
 * Upload an image to Cloudinary via a signed upload.
 *
 * Images are the only asset class that goes here: Cloudinary earns its place
 * through transforms, not storage. Customer documents and spreadsheet imports
 * go to R2.
 */
export async function uploadImage(
  file: Buffer,
  options: { folder: string; publicId?: string },
): Promise<CloudinaryImage> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder;
  const signature = cloudinarySignature({ folder, timestamp }, apiSecret);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]));
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);
  if (options.publicId) form.append("public_id", options.publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    public_id: string;
    secure_url: string;
    width: number;
    height: number;
  };
  return {
    publicId: data.public_id,
    secureUrl: data.secure_url,
    width: data.width,
    height: data.height,
  };
}

/** Cloudinary signs the alphabetically sorted parameter string, secret appended. */
export function cloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}
