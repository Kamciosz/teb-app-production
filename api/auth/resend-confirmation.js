import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 12;
const MAX_ATTEMPTS_PER_EMAIL = 4;

const resendRateStore = globalThis.__tebResendRateStore || new Map();
if (!globalThis.__tebResendRateStore) {
  globalThis.__tebResendRateStore = resendRateStore;
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  if (typeof xff === 'string' && xff) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function pruneRateStore(now) {
  for (const [key, state] of resendRateStore.entries()) {
    if (!state || state.resetAt <= now) {
      resendRateStore.delete(key);
    }
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = resendRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + RATE_WINDOW_MS };
    resendRateStore.set(key, state);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  resendRateStore.set(key, existing);

  if (existing.count > limit) {
    const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
    return { blocked: true, retryAfterSeconds };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex <= 1) return `***${email.slice(atIndex)}`;
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`;
}

function resolveEmailRedirectTo(req) {
  const rawOrigin = req.headers.origin;
  if (typeof rawOrigin === 'string' && rawOrigin) {
    try {
      const parsed = new URL(rawOrigin);
      return parsed.origin;
    } catch {
      return null;
    }
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;

  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : (typeof protoHeader === 'string' && protoHeader) || (process.env.NODE_ENV === 'development' ? 'http' : 'https');

  return `${proto}://${host}`;
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
  const now = Date.now();

  pruneRateStore(now);
  const clientIp = getClientIp(req);
  const ipRateState = registerAttemptAndCheck(`ip:${clientIp}`, MAX_ATTEMPTS_PER_IP, now);
  if (ipRateState.blocked) {
    res.setHeader('Retry-After', String(ipRateState.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many resend attempts. Please try again later.' });
  }

  if (email) {
    const emailRateState = registerAttemptAndCheck(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now);
    if (emailRateState.blocked) {
      res.setHeader('Retry-After', String(emailRateState.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many resend attempts. Please try again later.' });
    }
  }

  if (!email || !EMAIL_REGEX.test(email) || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return res.status(200).json({ ok: true });
  }

  try {
    const supabase = createServerSupabaseClient();
    const emailRedirectTo = resolveEmailRedirectTo(req);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: emailRedirectTo ? { emailRedirectTo } : undefined
    });

    if (error) {
      console.error(`[RESEND CONFIRMATION ERROR] email=${maskEmail(email)}, error=${error.message}`);
      return res.status(200).json({ ok: true });
    }

    console.log(`[RESEND CONFIRMATION SUCCESS] email=${maskEmail(email)}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[RESEND CONFIRMATION EXCEPTION]', error);
    return res.status(200).json({ ok: true });
  }
}