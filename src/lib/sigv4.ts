import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 for S3-compatible object storage (Cloudflare R2).
 *
 * Implemented directly rather than pulling in the AWS SDK: the whole surface
 * needed here is "sign a PUT/GET/DELETE for one object", the SDK adds tens of
 * megabytes and a native credential chain, and R2 is S3-compatible.
 *
 * The signing steps follow the published algorithm exactly, and the canonical
 * request is built from a sorted, encoded parameter list — the part that is
 * easiest to get subtly wrong and therefore the part covered by tests.
 */

export type SignParams = {
  method: string;
  host: string;
  path: string;
  query?: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** Injectable for deterministic tests. */
  now?: Date;
};

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/** RFC 3986 encoding — S3 requires encoding of everything except unreserved. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join("&");
}

function canonicalPath(path: string): string {
  // Encode each segment but keep the separators.
  return path
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

export function payloadSha256(body: Buffer | string): string {
  return sha256Hex(body);
}

export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function signRequest(params: SignParams): Record<string, string> {
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    ...params.headers,
    host: params.host,
    "x-amz-content-sha256": params.payloadHash,
    "x-amz-date": amzDate,
  };

  const sortedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();

  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${String(headers[findKey(headers, name)]).trim()}\n`)
    .join("");

  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalRequest = [
    params.method.toUpperCase(),
    canonicalPath(params.path),
    canonicalQuery(params.query ?? {}),
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${params.secretAccessKey}`, dateStamp), params.region), params.service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function findKey(headers: Record<string, string>, lower: string): string {
  return Object.keys(headers).find((k) => k.toLowerCase() === lower) ?? lower;
}

/** Exposed for tests: the exact canonical request string that gets signed. */
export function debugCanonicalRequest(params: SignParams): string {
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const headers: Record<string, string> = {
    ...params.headers,
    host: params.host,
    "x-amz-content-sha256": params.payloadHash,
    "x-amz-date": amzDate,
  };
  const sortedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${String(headers[findKey(headers, name)]).trim()}\n`)
    .join("");
  return [
    params.method.toUpperCase(),
    canonicalPath(params.path),
    canonicalQuery(params.query ?? {}),
    canonicalHeaders,
    sortedHeaderNames.join(";"),
    params.payloadHash,
  ].join("\n");
}
