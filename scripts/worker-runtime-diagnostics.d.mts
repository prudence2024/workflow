export function workerEnvironmentSummary(env?: NodeJS.ProcessEnv): {
  nodeEnv: "development" | "production" | "other";
  neonBranch: "development" | "production" | "other";
  localFormTestEnabled: boolean;
  workerDatabaseUrlPresent: boolean;
  expectedBranchConfigured: boolean;
  expectedProjectConfigured: boolean;
};
export function workerEvent(event: string, details?: Record<string, unknown>): string;
