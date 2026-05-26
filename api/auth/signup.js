import {
  applyNoStore,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';
import { createClient } from '@supabase/supabase-js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_EMAIL = 5;

const signupRateStore = globalThis.__tebSignupRateStore || new Map();
if (!globalThis.__tebSignupRateStore) {
  globalThis.__tebSignupRateStore = signupRateStore;
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
  for (const [key, state] of signupRateStore.entries()) {
    if (!state || state.resetAt <= now) signupRateStore.delete(key);
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = signupRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    signupRateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { blocked: false, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  signupRateStore.set(key, existing);
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

function resolveBaseUrl(req) {
  const rawOrigin = req.headers.origin;
  if (typeof rawOrigin === 'string' && rawOrigin) {
    try { return new URL(rawOrigin).origin; } catch { /* fall through */ }
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : (typeof protoHeader === 'string' && protoHeader) || 'https';
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
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const now = Date.now();

  pruneRateStore(now);
  const clientIp = getClientIp(req);
  const ipRateState = registerAttemptAndCheck(`ip:${clientIp}`, MAX_ATTEMPTS_PER_IP, now);
  if (ipRateState.blocked) {
    res.setHeader('Retry-After', String(ipRateState.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
  }

  if (email) {
    const emailRateState = registerAttemptAndCheck(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now);
    if (emailRateState.blocked) {
      res.setHeader('Retry-After', String(emailRateState.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
    }
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return res.status(400).json({ error: `Only ${ALLOWED_EMAIL_DOMAIN} addresses are allowed` });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Full name must be at most ${MAX_NAME_LENGTH} characters` });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[SIGNUP] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Auto-confirm: no email needed, account is ready immediately
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || null }
    });

    if (error) {
      console.error(`[SIGNUP ERROR] email=${maskEmail(email)}, error=${error.message}`);

      if (String(error.message || '').toLowerCase().includes('confirmation email')) {
        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna. Spróbuj ponownie za chwilę.' });
      }
      const errorMsg = String(error.message || error.msg || '').toLowerCase();
      if (errorMsg.includes('already been registered') || errorMsg.includes('already registered') || errorMsg.includes('email_exists') || errorMsg.includes('user already exists')) {
        return res.status(200).json({
          user: null, session: null,
          note: 'Konto o tym adresie e-mail już istnieje. Zaloguj się zamiast rejestrować.',
          alreadyExists: true
        });
      }
      return res.status(400).json({ error: 'Rejestracja nie powiodła się. Sprawdź dane i spróbuj ponownie.' });
    }

    console.log(`[SIGNUP SUCCESS] email=${maskEmail(email)}, userId=${data?.user?.id}`);

    return res.status(200).json({
      user: data?.user || null,
      session: null,
      note: 'Konto utworzone pomyślnie. Możesz się zalogować.'
    });
  } catch (error) {
    console.error('[SIGNUP EXCEPTION]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
