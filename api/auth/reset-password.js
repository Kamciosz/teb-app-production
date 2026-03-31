import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';

const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 8;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const resetRateStore = globalThis.__tebResetRateStore || new Map();
if (!globalThis.__tebResetRateStore) {
  globalThis.__tebResetRateStore = resetRateStore;
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
  for (const [key, state] of resetRateStore.entries()) {
    if (!state || state.resetAt <= now) resetRateStore.delete(key);
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = resetRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + RATE_WINDOW_MS };
    resetRateStore.set(key, state);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  resetRateStore.set(key, existing);
  if (existing.count > limit) {
    return { blocked: true, retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1) };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

function validateRedirectTo(req, redirectTo) {
  if (!redirectTo) return null;

  let parsedRedirect;
  try {
    parsedRedirect = new URL(redirectTo);
  } catch {
    return null;
  }

  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  if (!hostHeader) return null;

  const rawHost = String(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader)
    .split(',')[0]
    .trim()
    .toLowerCase();
  const allowedHostname = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];

  if (parsedRedirect.hostname.toLowerCase() !== allowedHostname) {
    return null;
  }

  return parsedRedirect.toString();
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
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : '';
  const now = Date.now();

  pruneRateStore(now);
  const ipRate = registerAttemptAndCheck(`ip:${getClientIp(req)}`, MAX_ATTEMPTS_PER_IP, now);
  if (ipRate.blocked) {
    res.setHeader('Retry-After', String(ipRate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many password reset attempts. Please try again later.' });
  }

  if (email) {
    const emailRate = registerAttemptAndCheck(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now);
    if (emailRate.blocked) {
      res.setHeader('Retry-After', String(emailRate.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many password reset attempts. Please try again later.' });
    }
  }

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const safeRedirectTo = validateRedirectTo(req, redirectTo);
  if (redirectTo && !safeRedirectTo) {
    return res.status(400).json({ error: 'Invalid redirect URL' });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      ...(safeRedirectTo ? { redirectTo: safeRedirectTo } : {})
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('auth/reset-password error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
