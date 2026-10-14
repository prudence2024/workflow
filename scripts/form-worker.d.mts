export function resolveChrome(): string;
export function resolveChromePath(): string;
export function assertUrlAllowed(raw: string, method?: string): Promise<string>;
export function processRecord(browser: unknown, job: Record<string, unknown>): Promise<Record<string, unknown>>;
export function claimOne(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, campaignId: string | null, organizationId: string | null): Promise<{ rec: Record<string, unknown>; campaign: Record<string, unknown>; contact: Record<string, unknown> | null } | null>;
