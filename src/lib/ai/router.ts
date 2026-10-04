import "server-only";
import { approvedModelsFor } from "./registry";
import { nvidiaChatCompletion } from "./providers/nvidia";
import type { AiCompletion, AiContext, AiMessage } from "./types";

export async function routeAiCompletion(context: AiContext, messages: AiMessage[]): Promise<AiCompletion> {
  const models = approvedModelsFor(context.task, context.requiredCapabilities);
  if (models.length === 0) throw new Error("No approved AI model supports this task");
  let lastError: unknown;
  for (const model of models.slice(0, 2)) {
    try {
      return await nvidiaChatCompletion({ model: model.id, messages });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider unavailable");
}

export function parseStructuredJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}