import "server-only";
import type { AiCompletion, AiMessage } from "../types";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function safeErrorMessage(responseText: string): string {
  return responseText.replace(/(?:bearer|token|authorization|api[_ -]?key)\s*[:=]?\s*\S+/gi, "[redacted]").slice(0, 220);
}

export async function nvidiaChatCompletion(input: {
  model: string;
  messages: AiMessage[];
  timeoutMs?: number;
}): Promise<AiCompletion> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("AI provider is not configured");
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 25_000);
  try {
    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.2, top_p: 0.7, max_tokens: 1200, stream: false }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`AI provider request failed (${response.status}): ${safeErrorMessage(text)}`);
    const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("AI provider returned no content");
    return { provider: "nvidia", model: input.model, text: content, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}