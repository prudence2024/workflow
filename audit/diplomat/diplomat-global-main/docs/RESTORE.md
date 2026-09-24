# Diplomat Global — Backup Restore Procedure

## Overview

Backups are exported as ZIP files from Admin → Backup. Each ZIP contains:

```
backup-{timestamp}.zip
├── manifest.json          # Export metadata, table list, row counts
├── schema-info.json       # Table schemas, columns, types
├── relationships.json     # Foreign key relationships
├── tables/
│   ├── {table}.json       # Full table data (JSON)
│   └── {table}.csv        # Tabular data (CSV)
└── README.md              # Human-readable summary
```

## Security

The following are **excluded** from exports:

- `newsletter_subscribers.unsubscribe_token`
- `customers.unsubscribe_token`
- `receipts.download_token`
- Environment variables, API keys, service-role keys

## Restore Steps (Supabase)

> ⚠️ **WARNING**: Restore is destructive. It replaces current data.
> Always create a manual backup before restoring.

### Prerequisites

- Supabase project access (dashboard or CLI)
- The backup ZIP file
- A text editor or script runner

### Step 1: Verify Backup Integrity

1. Unzip the backup
2. Open `manifest.json` — verify timestamp, table count, row counts
3. Open `schema-info.json` — verify table structures match your schema
4. Spot-check a few `tables/*.json` files for data integrity

### Step 2: Disable Webhooks (Optional)

If automated notifications are active, temporarily disable them to prevent
duplicate notifications during restore:

- Set `TELEGRAM_BOT_TOKEN` to empty in Vercel env
- Or remove the Telegram webhook via BotFather

### Step 3: Restore Tables

For each table in `tables/`:

**Option A: Supabase Dashboard SQL**

```sql
-- TRUNCATE existing data (careful!)
TRUNCATE TABLE {table_name} CASCADE;

-- Insert from JSON
-- Use the Supabase SQL Editor with the JSON data
```

**Option B: Supabase CLI**

```bash
# For each table
supabase db reset  # Only if you have a migration that recreates the schema
```

**Option C: Programmatic (Node.js)**

```javascript
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function restoreTable(tableName) {
  const data = JSON.parse(
    fs.readFileSync(`tables/${tableName}.json`, "utf-8")
  );

  // Delete existing
  await supabase.from(tableName).delete().neq("id", data[0]?.id || "0");

  // Insert in batches of 100
  for (let i = 0; i < data.length; i += 100) {
    const batch = data.slice(i, i + 100);
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) console.error(`Error restoring ${tableName}:`, error);
  }
}

// Restore in dependency order
const tables = [
  "roles",
  "permissions",
  "admin_users",
  "categories",
  "products",
  "inventory",
  "customers",
  "orders",
  "order_items",
  "payment_transactions",
  "receipts",
  "coupons",
  "expenses",
  "blog_posts",
  "hero_slides",
  "testimonials",
  "social_links",
  "site_settings",
  "newsletter_subscribers",
  "messages",
  "communication_logs",
  "audit_logs",
  "notifications",
];

for (const table of tables) {
  console.log(`Restoring ${table}...`);
  await restoreTable(table);
}
```

### Step 4: Restore Sequences (if applicable)

After restoring tables with UUID primary keys, sequences are auto-managed.
For integer sequences:

```sql
SELECT setval('{table}_id_seq', (SELECT MAX(id) FROM {table}));
```

### Step 5: Verify Restore

1. Check row counts match the manifest
2. Spot-check critical data (orders, products, customers)
3. Verify admin login works
4. Test a public page loads correctly
5. Check that images load (Cloudinary URLs are preserved)

### Step 6: Re-enable Webhooks

If disabled in Step 2, re-enable:
- Restore `TELEGRAM_BOT_TOKEN` in Vercel env
- Re-register the Telegram webhook

## Restore Order (Dependency-Aware)

Tables should be restored in this order to respect foreign keys:

1. `roles`
2. `permissions`
3. `admin_users` (depends on roles)
4. `categories`
5. `products` (depends on categories)
6. `inventory` (depends on products)
7. `customers`
8. `orders` (depends on customers)
9. `order_items` (depends on orders, products)
10. `payment_transactions` (depends on orders)
11. `receipts` (depends on orders)
12. `coupons`
13. `expenses`
14. `blog_posts`
15. `hero_slides`
16. `testimonials`
17. `social_links`
18. `site_settings`
19. `newsletter_subscribers`
20. `messages`
21. `communication_logs`
22. `audit_logs`
23. `notifications`

## Non-Production Restore Test

To verify the restore procedure works:

1. Create a test Supabase project
2. Apply the baseline migration
3. Restore from a backup
4. Verify all tables have data
5. Run the application against the test project
6. Verify admin and public pages work

## Rollback

If a restore causes issues:

1. Restore from the most recent backup
2. Or use Supabase point-in-time recovery (if enabled)
3. Re-deploy the previous Vercel deployment
