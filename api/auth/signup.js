import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed,
  setSessionCookies
} from '../../lib/serverAuth.js';

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
    if (!state || state.resetAt <= now) {
      signupRateStore.delete(key);
    }
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = signupRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + RATE_WINDOW_MS };
    signupRateStore.set(key, state);
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

function toClientSession(session) {
  if (!session) return null;

  return {
    access_token: session.access_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user || null
  };
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

  const body = await readJsonBody(req);
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
    const supabase = createServerSupabaseClient();
    const emailRedirectTo = resolveEmailRedirectTo(req);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
        data: {
          full_name: fullName || null
        }
      }
    });

    if (error) {
      console.error(`[SIGNUP ERROR] email=${maskEmail(email)}, error=${error.message}`, error);
      
      if (String(error.message || '').toLowerCase().includes('confirmation email')) {
        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna: problem z wysyłką maila potwierdzającego. Spróbuj ponownie za chwilę.' });
      }
      if (String(error.message || '').toLowerCase().includes('already registered')) {
        return res.status(200).json({
          user: null,
          session: null,
          note: 'If this account already exists, please sign in or reset your password.'
        });
      }
      return res.status(400).json({ error: 'Signup failed. Please verify your data and try again.' });
    }

    console.log(`[SIGNUP SUCCESS] email=${maskEmail(email)}, user_id=${data?.user?.id}`);
    if (data?.session) {
      setSessionCookies(res, data.session);
    }

    return res.status(200).json({
      user: data?.user || null,
      session: toClientSession(data?.session || null)
    });
  } catch (error) {
    console.error('[SIGNUP EXCEPTION]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
