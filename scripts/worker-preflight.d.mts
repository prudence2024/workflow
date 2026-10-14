export function workerDatabaseUrl(env?: NodeJS.ProcessEnv): string | null;
export function isDevelopmentWorkerRun(env?: NodeJS.ProcessEnv): boolean;
export function workerOrganizationId(env?: NodeJS.ProcessEnv): string | null;
export function validateWorkerScope(input: { campaignId: string | null; recordId: string | null; recover: boolean }, env?: NodeJS.ProcessEnv): void;
export function validateDevelopmentEnvironment(env?: NodeJS.ProcessEnv): { mode: "development" | "production" };
export function verifyWorkerDatabase(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, env?: NodeJS.ProcessEnv): Promise<{ role: string; database: string; branchVerified: boolean }>;
export function runWorkerPreflight(input: { client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }; campaignId: string | null; recordId: string | null; recover: boolean; env?: NodeJS.ProcessEnv }): Promise<{ mode: "development" | "production"; identity: { role: string; database: string; branchVerified: boolean }; campaignId?: string; organizationId?: string; campaignStatus?: string }>;
