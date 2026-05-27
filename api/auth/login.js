import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed,
  setSessionCookies
} from '../../lib/serverAuth.js';
import errorLog from '../../lib/errorLog.js';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 10;

/*
 * Rate limiting: in-memory Map (globalThis).
 *
 * TODO: Migrate to Vercel KV (@vercel/kv) for persistence across cold starts.
 * See signup.js for a full migration guide comment.
 * In-memory is acceptable for ~1000 students in production.
 */
const loginRateStore = globalThis.__tebLoginRateStore || new Map();
if (!globalThis.__tebLoginRateStore) {
  globalThis.__tebLoginRateStore = loginRateStore;
}

function getClientIp(req) {
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) return xRealIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length > 0) return String(xff[0]).split(',')[0].trim();
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function pruneRateStore(now) {
  for (const [key, state] of loginRateStore.entries()) {
    if (!state || state.resetAt <= now) loginRateStore.delete(key);
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = loginRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + RATE_WINDOW_MS };
    loginRateStore.set(key, state);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  loginRateStore.set(key, existing);
  if (existing.count > limit) {
    return { blocked: true, retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1) };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!requireSameOrigin(req, res)) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error?.statusCode === 413) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const now = Date.now();

  pruneRateStore(now);
  const rateState = registerAttemptAndCheck(`ip:${getClientIp(req)}`, MAX_ATTEMPTS_PER_IP, now);
  if (rateState.blocked) {
    res.setHeader('Retry-After', String(rateState.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session) {
      return res.status(401).json({ error: error?.message || 'Invalid login credentials' });
    }

    setSessionCookies(res, data.session);
    return res.status(200).json({
      session: {
        access_token: data.session.access_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.user
      },
      user: data.user
    });
  } catch (error) {
    console.error('auth/login error', error);
    await errorLog.log('error', 'login', error.message, {
      stack: error.stack?.slice(0, 500)
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
