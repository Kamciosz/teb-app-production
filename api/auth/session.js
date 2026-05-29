import {
  applyNoStore,
  createServerSupabaseClient,
  getSessionFromCookies,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed,
  setSessionCookies
} from '../../lib/serverAuth.js';

export default async function handler(req, res) {
  applyNoStore(res);

  // POST — accepts tokens from email confirmation redirect (URL hash)
  // The confirmation link redirects back with #access_token=xxx&refresh_token=xxx
  if (req.method === 'POST') {
    if (!requireSameOrigin(req, res)) return;

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: 'Invalid body' });
    }

    const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
    const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';

    if (!accessToken || !refreshToken) {
      console.warn('[SESSION POST] Missing tokens');
      return res.status(400).json({ error: 'Missing tokens' });
    }

    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error || !data?.user) {
        console.warn('[SESSION POST] Invalid token — cannot set session cookies');
        return res.status(401).json({ error: 'Invalid token' });
      }

      const normalizedSession = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: body.expires_in || 3600,
        token_type: 'bearer',
        user: data.user
      };

      setSessionCookies(res, normalizedSession);

      console.log(`[SESSION POST] Session cookies set for ${data.user.email}`);

      return res.status(200).json({
        session: {
          access_token: accessToken,
          expires_at: null,
          expires_in: body.expires_in || 3600,
          token_type: 'bearer',
          user: data.user
        }
      });
    } catch (error) {
      console.error('[SESSION POST] Error:', error.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  // GET — read session from cookies (existing behavior)
  if (!requireSameOrigin(req, res)) {
    return;
  }

  try {
    const { session } = await getSessionFromCookies(req, res);
    return res.status(200).json({ session });
  } catch (error) {
    console.error('auth/session error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
