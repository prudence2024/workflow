import "server-only";

export type SafeErrorDiagnostic = {
  errorName: string;
  code: string | null;
  safeMessage: string;
};

function redact(value: string): string {
  return value
    .replace(/(?:bearer|token|authorization|cookie|secret|password|database_url)\s*[:=]?\s*\S+/gi, "[redacted]")
    .replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 240);
}

export function safeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  const value = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };
  const message = typeof value?.message === "string" ? value.message : "unknown operational error";
  const code =
    typeof value?.code === "string"
      ? value.code
      : typeof value?.cause?.code === "string"
        ? value.cause.code
        : null;
  return {
    errorName: typeof value?.name === "string" ? value.name : "Error",
    code,
    safeMessage: redact(message),
  };
}

export async function timedRuntimeStage<T>(
  stage: string,
  operation: () => Promise<T>,
  context: Record<string, string | number | boolean | null> = {},
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.info("[runtime] stage", {
      stage,
      outcome: "success",
      durationMs: Date.now() - startedAt,
      ...context,
    });
    return result;
  } catch (error) {
    console.error("[runtime] stage", {
      stage,
      outcome: "failure",
      durationMs: Date.now() - startedAt,
      ...context,
      error: safeErrorDiagnostic(error),
    });
    throw error;
  }
}
