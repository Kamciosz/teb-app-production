import {
  applyNoStore,
  getSessionFromCookies,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

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
