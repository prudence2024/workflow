import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export const hasDatabase = Boolean(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
);

if (!hasDatabase) {
  // Reported rather than silently skipped: a suite that never ran must never be
  // described as passing.
  console.warn(
    "[tests] DATABASE_URL_UNPOOLED is not set — PostgreSQL isolation suites will be reported as SKIPPED.",
  );
}
