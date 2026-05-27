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
      console.error('[errorLog] Supabase insert failed:', error.message);
    }
  } catch (err) {
    console.error('[errorLog] Exception:', err.message);
  }
}

export default { log };
