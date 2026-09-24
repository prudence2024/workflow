import { readFileSync } from 'fs';
import https from 'https';

// Load env
const lines = readFileSync('.env.local', 'utf8').split('\n');
for (const line of lines) {
  if (line.startsWith('#') || !line.trim()) continue;
  const idx = line.indexOf('=');
  if (idx > 0) {
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = val;
  }
}

const BASE = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

function supaQuery(table, select = '*', filters = '') {
  return new Promise((resolve, reject) => {
    let path = `/rest/v1/${table}?select=${select}`;
    if (filters) path += '&' + filters;
    
    const url = new URL(path, BASE);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error(`  ERROR ${table} (${res.statusCode}):`, data.substring(0, 300));
          resolve([]);
        } else {
          try { resolve(JSON.parse(data)); }
          catch { resolve([]); }
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const since24h = new Date(Date.now() - 86400000).toISOString();

async function run() {
  // 1. NOTIFICATION READS
  console.log('=== NOTIFICATION READS ===');
  const reads = await supaQuery('admin_notification_reads', '*', 'order=created_at.desc&limit=10');
  console.log('Total rows:', reads.length);
  for (const r of reads) {
    console.log(`  id=${r.id} admin=${r.admin_user_id} audit_log=${r.audit_log_id} read_at=${r.read_at}`);
  }

  // 2. ADMIN USERS (column is 'active' not 'is_active')
  console.log('\n=== ADMIN USERS ===');
  const admins = await supaQuery('admin_users', 'id,clerk_user_id,role_id,active,created_at', 'order=created_at.desc&limit=10');
  for (const a of admins) {
    console.log(`  id=${a.id} clerk=${a.clerk_user_id} role_id=${a.role_id} active=${a.active}`);
  }

  // 3. AUDIT LOGS — check actual columns first
  console.log('\n=== AUDIT LOGS SCHEMA CHECK ===');
  const sampleAudit = await supaQuery('audit_logs', '*', 'limit=1');
  if (sampleAudit.length > 0) {
    console.log('Columns:', Object.keys(sampleAudit[0]).join(', '));
  } else {
    console.log('No audit_logs rows found');
  }

  // 4. All audit events (last 24h) with correct columns
  console.log('\n=== ALL AUDIT EVENTS (last 24h) ===');
  const allAudit = await supaQuery('audit_logs', '*', `created_at=gte.${since24h}&order=created_at.desc&limit=100`);
  console.log('Total events:', allAudit.length);
  
  // Group by action
  const byAction = {};
  for (const e of allAudit) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
  }
  console.log('By action:');
  for (const [k, v] of Object.entries(byAction)) {
    console.log(`  ${k}: ${v}`);
  }
  
  // Show denial events
  const denials = allAudit.filter(e => e.action === 'admin_permission_denied');
  console.log(`\nPermission denied events: ${denials.length}`);
  for (const d of denials.slice(0, 20)) {
    console.log(`  [${d.created_at}] action=${d.action} perm=${d.required_permission || 'N/A'} route=${d.route || 'N/A'} actor=${d.actor_id || 'N/A'}`);
  }

  // Show session events
  const sessions = allAudit.filter(e => e.action === 'admin_session_started');
  console.log(`\nSession started events: ${sessions.length}`);
  const sessionByUser = {};
  for (const s of sessions) {
    const uid = s.actor_id || 'unknown';
    sessionByUser[uid] = (sessionByUser[uid] || 0) + 1;
  }
  for (const [k, v] of Object.entries(sessionByUser)) {
    console.log(`  actor=${k}: ${v} events`);
  }
  for (const s of sessions.slice(0, 10)) {
    const meta = s.metadata || {};
    console.log(`  [${s.created_at}] actor=${s.actor_id} session_id=${meta.session_id || 'N/A'}`);
  }

  // 5. TESTIMONIALS — full moderation check
  console.log('\n=== TESTIMONIALS FULL ===');
  const testimonials = await supaQuery('testimonials', '*', 'order=created_at.desc&limit=10');
  console.log('Total:', testimonials.length);
  for (const t of testimonials) {
    console.log(`  name=${t.name} active=${t.active} mod=${t.moderation_status} consent=${t.consent_to_publish} has_email=${!!t.email}`);
  }

  // 6. MARKETING SUPPRESSION
  console.log('\n=== MARKETING SUPPRESSION ===');
  const suppression = await supaQuery('marketing_suppression', '*', 'order=created_at.desc&limit=10');
  console.log('Total rows:', suppression.length);
  for (const s of suppression) {
    console.log(`  email=${s.email} reason=${s.reason} source=${s.source} time=${s.created_at}`);
  }

  // 7. CUSTOMERS — all
  console.log('\n=== CUSTOMERS ===');
  const customers = await supaQuery('customers', 'id,email,first_name,marketing_consent,marketing_unsubscribed_at,unsubscribe_token', 'order=created_at.desc');
  console.log('Total:', customers.length);
  for (const c of customers) {
    console.log(`  email=${c.email} consent=${c.marketing_consent} unsub_at=${c.marketing_unsubscribed_at} has_token=${!!c.unsubscribe_token}`);
  }

  // 8. NEWSLETTER — check actual columns
  console.log('\n=== NEWSLETTER SUBSCRIBERS ===');
  const nlSample = await supaQuery('newsletter_subscribers', '*', 'limit=1');
  if (nlSample.length > 0) {
    console.log('Columns:', Object.keys(nlSample[0]).join(', '));
    const nl = await supaQuery('newsletter_subscribers', '*', 'order=created_at.desc&limit=10');
    console.log('Total:', nl.length);
    for (const n of nl) {
      console.log(`  email=${n.email} active=${n.is_active} unsub=${n.unsubscribed_at} has_token=${!!n.unsubscribe_token}`);
    }
  }

  // 9. ROLE PERMISSIONS for admin role
  console.log('\n=== ADMIN ROLE PERMISSIONS ===');
  const adminRole = roles.find(r => r.key === 'admin');
  if (adminRole) {
    const rp = await supaQuery('role_permissions', 'permission_id', `role_id=eq.${adminRole.id}`);
    console.log('Admin role permissions count:', rp.length);
    // Get permission keys
    if (rp.length > 0) {
      const pids = rp.map(r => r.permission_id);
      const perms = await supaQuery('permissions', 'id,key', `id=in.(${pids.join(',')})`);
      console.log('Permission keys:', perms.map(p => p.key).sort().join(', '));
    }
  }
}

// Declare roles variable at module scope for reuse
let roles = [];

async function main() {
  roles = await supaQuery('roles', 'id,key,name', '');
  await run();
}

main().catch(e => console.error(e));
