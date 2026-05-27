import {
  applyNoStore,
  sendMethodNotAllowed,
  getSessionFromCookies
} from '../lib/serverAuth.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);

  // Require admin authentication
  const { session, error: sessionError } = await getSessionFromCookies(req, res);
  if (sessionError || !session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userRoles = session.user?.user_metadata?.roles || ['student'];
  const isAdmin = Array.isArray(userRoles) && userRoles.some(r => ['admin', 'moderator_users'].includes(r));
  if (!isAdmin) {
    return res.status(403).json({ error: 'Forbidden: admin or moderator role required' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Fetch all auth users via admin API
    const { data: usersData, error: usersError } = await serviceClient.auth.admin.listUsers();
    if (usersError) throw usersError;

    const users = usersData?.users || [];
    const total_users = users.length;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const confirmed_users = users.filter(u => u.email_confirmed_at).length;
    const users_last_24h = users.filter(u => {
      const created = new Date(u.created_at);
      return created >= twentyFourHoursAgo;
    }).length;

    // Users by day for last 7 days
    const users_by_day = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const count = users.filter(u => {
        const created = new Date(u.created_at);
        return created >= dayStart && created <= dayEnd;
      }).length;

      users_by_day.push({
        date: dayStart.toISOString().split('T')[0],
        count
      });
    }

    return res.status(200).json({
      total_users,
      confirmed_users,
      users_last_24h,
      users_by_day
    });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
