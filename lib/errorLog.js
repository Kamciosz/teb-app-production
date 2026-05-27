/**
 * Error Log Module — lib/errorLog.js
 *
 * Central error logging for Vercel serverless functions.
 * Logs errors to a Supabase `error_logs` table via service role key (bypasses RLS).
 *
 * Usage:
 *   import errorLog from '../../lib/errorLog.js';
 *   await errorLog.log('error', 'signup', 'Something failed', { email: masked });
 */

import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[errorLog] Missing Supabase config — log entry dropped');
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function ensureTable(client) {
  try {
    const { error } = await client.from('error_logs').select('count', { count: 'exact', head: true }).limit(0);
    if (error) throw error;
    return true;
  } catch {
    // Table doesn't exist — create it via raw Supabase SQL API
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const createSql = [
        `create table if not exists public.error_logs (`,
        `  id bigserial primary key,`,
        `  level text not null default 'error',`,
        `  source text not null default 'api',`,
        `  message text not null,`,
        `  details jsonb not null default '{}'::jsonb,`,
        `  created_at timestamptz not null default timezone('utc', now()),`,
        `  constraint error_logs_level_check check (level in ('info', 'warn', 'error'))`,
        `);`,
        `create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);`,
        `create index if not exists idx_error_logs_level on public.error_logs (level);`,
        `create index if not exists idx_error_logs_source on public.error_logs (source);`,
        `alter table public.error_logs enable row level security;`,
        `create policy if not exists error_logs_service_role_all on public.error_logs for all to service_role using (true) with check (true);`
      ].join('\n');
      
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/pgquery`, {
        method: 'POST',
        headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: createSql }),
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) {
        console.error('[errorLog] Auto-create table failed:', await resp.text().catch(() => resp.status));
        return false;
      }
      console.log('[errorLog] Auto-created error_logs table');
      return true;
    } catch (err) {
      console.error('[errorLog] Auto-create exception:', err.message);
      return false;
    }
  }
}

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} source    — e.g. 'signup', 'login', 'api', 'email'
 * @param {string} message   — human-readable description
 * @param {object} [details] — optional JSON-serializable metadata
 */
async function log(level, source, message, details = {}) {
  try {
    const client = getServiceClient();
    if (!client) return;

    const { error } = await client
      .from('error_logs')
      .insert({
        level,
        source,
        message: String(message).slice(0, 2000),
        details: details || {},
        created_at: new Date().toISOString()
      });

    if (error) {
      // If table missing, try auto-create and retry once
      if (error.code === 'PGRST205' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
        console.log('[errorLog] Table missing, attempting auto-create...');
        const created = await ensureTable(client);
        if (created) {
          const retry = await client.from('error_logs').insert({
            level, source, message: String(message).slice(0, 2000), details: details || {}, created_at: new Date().toISOString()
          });
          if (retry.error) console.error('[errorLog] Retry failed:', retry.error.message);
        }
      } else {
        console.error('[errorLog] Supabase insert failed:', error.message);
      }
    }
  } catch (err) {
    console.error('[errorLog] Exception:', err.message);
  }
}

export default { log };
