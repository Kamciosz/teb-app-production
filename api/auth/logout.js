import {
  applyNoStore,
  clearSessionCookies,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!requireSameOrigin(req, res)) {
    return;
  }

  clearSessionCookies(res);
  return res.status(200).json({ ok: true });
}
