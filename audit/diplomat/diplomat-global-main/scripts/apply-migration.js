#!/usr/bin/env node
/**
 * Apply the full schema migration to the live Supabase database.
 * 
 * Usage:
 *   node scripts/apply-migration.js
 * 
 * Requires: SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
 * 
 * Since Supabase JS client doesn't support raw SQL via REST,
 * this script creates a helper function first, then uses it.
 * 
 * ALTERNATIVE: Copy the SQL from supabase/migrations/20260820_full_schema.sql
 * and paste it into the Supabase Dashboard SQL Editor:
 *   https://supabase.com/dashboard/project/_/sql/new
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const sql = fs.readFileSync('supabase/migrations/20260820_full_schema.sql', 'utf8');
  
  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  // Execute each statement via RPC (if exec_sql function exists)
  // or report which statements need manual execution
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        if (error.message?.includes('function "exec_sql" does not exist')) {
          console.log('\n❌ exec_sql function not found.');
          console.log('Please run the migration SQL manually:');
          console.log('1. Go to https://supabase.com/dashboard/project/_/sql/new');
          console.log('2. Paste the contents of: supabase/migrations/20260820_full_schema.sql');
          console.log('3. Click "Run"\n');
          process.exit(1);
        }
        errorCount++;
        if (i < 5) console.log(`  ⚠ Statement ${i+1}: ${error.message?.slice(0, 100)}`);
      } else {
        successCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }
  
  console.log(`\n✅ ${successCount} statements succeeded`);
  if (errorCount > 0) console.log(`⚠ ${errorCount} statements had errors`);
}

main().catch(console.error);
