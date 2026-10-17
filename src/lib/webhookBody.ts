import "server-only";

/** Keep untrusted provider payloads from being buffered without a bound. */
export const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export class WebhookBodyTooLargeError extends Error {
  constructor() {
    super("Webhook body is too large");
    this.name = "WebhookBodyTooLargeError";
  }
}

export async function readWebhookBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WebhookBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
