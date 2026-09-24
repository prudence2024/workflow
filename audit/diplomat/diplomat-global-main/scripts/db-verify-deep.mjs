import { readFileSync } from 'fs';
import https from 'https';

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
        'Prefer': 'return=representation',
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
  // 1. Denial events with metadata extraction
  console.log('=== PERMISSION DENIED EVENTS (last 24h) — with metadata ===');
  const denials = await supaQuery('audit_logs', 'id,clerk_user_id,action,metadata,ip_address,user_agent,created_at',
    `action=eq.admin_permission_denied&created_at=gte.${since24h}&order=created_at.desc&limit=100`);
  console.log('Total:', denials.length);
  
  // Extract metadata fields
  for (const d of denials.slice(0, 30)) {
    const m = d.metadata || {};
    console.log(`  [${d.created_at}] clerk=${d.clerk_user_id} perm=${m.required_permission || 'N/A'} route=${m.route || 'N/A'} reason=${m.reason || 'N/A'} ip=${d.ip_address || 'N/A'}`);
  }

  // 2. Group denials by metadata.required_permission
  console.log('\n=== DENIALS BY PERMISSION ===');
  const byPerm = {};
  const byReason = {};
  const byTimeWindow = {};
  for (const d of denials) {
    const m = d.metadata || {};
    const perm = m.required_permission || 'unknown';
    const reason = m.reason || 'unknown';
    byPerm[perm] = (byPerm[perm] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    
    // Time window grouping (hourly)
    const hour = d.created_at.substring(0, 13); // YYYY-MM-DDTHH
    byTimeWindow[hour] = (byTimeWindow[hour] || 0) + 1;
  }
  console.log('By permission:');
  for (const [k, v] of Object.entries(byPerm).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('By reason:');
  for (const [k, v] of Object.entries(byReason).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('By hour:');
  for (const [k, v] of Object.entries(byTimeWindow).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  // 3. Check if denials are from OLD code or NEW code
  // Old code: logAudit("admin_permission_denied", ...) with different parameters
  // New code: only fires on auditOnDenial: true
  console.log('\n=== DENIAL ENTITY TYPES (old vs new code signature) ===');
  const byEntity = {};
  for (const d of denials) {
    const et = d.entity_type || 'null';
    byEntity[et] = (byEntity[et] || 0) + 1;
  }
  for (const [k, v] of Object.entries(byEntity)) {
    console.log(`  entity_type=${k}: ${v}`);
  }

  // 4. Session starts detail
  console.log('\n=== SESSION STARTS DETAIL ===');
  const sessions = await supaQuery('audit_logs', 'id,clerk_user_id,action,metadata,ip_address,user_agent,created_at',
    `action=eq.admin_session_started&order=created_at.desc&limit=20`);
  console.log('Total:', sessions.length);
  for (const s of sessions) {
    const m = s.metadata || {};
    console.log(`  [${s.created_at}] clerk=${s.clerk_user_id} session=${m.session_id || 'N/A'} ip=${s.ip_address || 'N/A'}`);
    console.log(`    ua=${(s.user_agent || '').substring(0, 80)}`);
  }

  // 5. Notification read persistence test - check read_at timestamps
  console.log('\n=== NOTIFICATION READS DETAIL ===');
  const reads = await supaQuery('admin_notification_reads', 'id,admin_user_id,audit_log_id,read_at,created_at', 'order=created_at.desc&limit=20');
  console.log('Total rows:', reads.length);
  // Check for duplicates
  const uniqueAdmins = new Set(reads.map(r => r.admin_user_id));
  const uniqueAuditLogs = new Set(reads.map(r => r.audit_log_id));
  console.log('Unique admins:', uniqueAdmins.size);
  console.log('Unique audit_logs referenced:', uniqueAuditLogs.size);
  for (const r of reads.slice(0, 10)) {
    console.log(`  admin=${r.admin_user_id} audit_log=${r.audit_log_id} read_at=${r.read_at}`);
  }

  // 6. Check which audit logs are being read - are they denials or sessions?
  if (uniqueAuditLogs.size > 0) {
    const logIds = [...uniqueAuditLogs].join(',');
    console.log('\n=== REFERENCED AUDIT LOGS ===');
    const refLogs = await supaQuery('audit_logs', 'id,action,clerk_user_id,created_at', `id=in.(${logIds})&order=id.asc`);
    for (const l of refLogs) {
      console.log(`  id=${l.id} action=${l.action} clerk=${l.clerk_user_id} time=${l.created_at}`);
    }
  }
}

run().catch(e => console.error(e));
