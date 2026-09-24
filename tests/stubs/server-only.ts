/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws when imported outside a React Server Component
 * context. Tests import server modules directly, so the marker is neutralised
 * here while production keeps the genuine guard.
 */
export {};
