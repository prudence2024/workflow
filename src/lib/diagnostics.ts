import "server-only";

export type SafeErrorDiagnostic = {
  errorName: string;
  code: string | null;
  safeMessage: string;
};

export function safeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  const value = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };
  const rawCode =
    typeof value?.code === "string"
      ? value.code
      : typeof value?.cause?.code === "string"
        ? value.cause.code
        : null;
  const code = rawCode && /^[A-Z0-9_]{1,32}$/.test(rawCode) ? rawCode : null;
  const errorName = typeof value?.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(value.name) ? value.name : "Error";
  // Provider/SQL messages can contain arbitrary personal values or credentials.
  // Record the error class and code, never the raw message or cause payload.
  return { errorName, code, safeMessage: code ? `Operational failure (${code})` : "Operational failure" };
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
