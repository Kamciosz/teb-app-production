import {
  applyNoStore,
  createServerSupabaseClient,
  getSessionFromCookies,
  sendMethodNotAllowed
} from '../lib/serverAuth.js';

/**
 * GET /api/logs
 *
 * Returns error logs from the error_logs table.
 * Admin-only. Supports filtering by level, source, and pagination.
 *
 * Query params:
 *   level  — 'error' | 'warn' | 'info' (optional, default: all)
 *   source — e.g. 'signup', 'login', 'api' (optional, default: all)
 *   limit  — max rows (default: 50, max: 200)
 *   offset — pagination offset (default: 0)
 */
export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);

  // Authenticate — require valid session
  const { session, error: sessionError } = await getSessionFromCookies(req, res);
  if (sessionError || !session?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = createServerSupabaseClient();

    // Check admin role via profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('roles')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    const roles = profile.roles || [];
    if (!roles.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden — admin role required' });
    }

    // Build query
    const level = typeof req.query.level === 'string' ? req.query.level.trim() : null;
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Use service client to bypass RLS for reading logs
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let query = serviceClient
      .from('error_logs')
      .select('*', { count: 'exact' });

    if (level && ['info', 'warn', 'error'].includes(level)) {
      query = query.eq('level', level);
    }
    if (source) {
      query = query.eq('source', source);
    }

    const { data: logs, error: fetchError, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error('[logs] Fetch error:', fetchError.message);
      return res.status(500).json({ error: 'Failed to fetch logs' });
    }

    return res.status(200).json({
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    });

  } catch (err) {
    console.error('[logs] Exception:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
