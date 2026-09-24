import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local development secrets without ever committing them.
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Migrations use the DIRECT (unpooled) Neon endpoint on purpose.
 * DDL through a PgBouncer-style pooler is unreliable, so:
 *   - application runtime  -> DATABASE_URL       (pooled, -pooler host)
 *   - migrations / drizzle -> DATABASE_URL_UNPOOLED (direct host)
 */
const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL must be set to run Drizzle commands.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url: migrationUrl },
});
