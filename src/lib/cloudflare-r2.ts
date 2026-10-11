import { getCloudflareContext } from "@opennextjs/cloudflare";

type NativeR2Bucket = {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
};

declare global {
  interface CloudflareEnv {
    UPLOADS?: NativeR2Bucket;
  }
}

/** Cloudflare-only fallback adapter; the Netlify Node runtime does not call this module. */
export function getCloudflareR2Bucket(): NativeR2Bucket | null {
  const { env } = getCloudflareContext({ async: false });
  return ((env as CloudflareEnv).UPLOADS as NativeR2Bucket | undefined) ?? null;
}
