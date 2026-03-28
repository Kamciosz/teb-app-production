import { createClient } from '@supabase/supabase-js';

const ACCESS_COOKIE = 'teb_access_token';
const REFRESH_COOKIE = 'teb_refresh_token';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration');
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

function normalizeCookieValue(value) {
  return encodeURIComponent(value);
}

function buildCookie(name, value, maxAge, extras = []) {
  const base = [
    `${name}=${normalizeCookieValue(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];

  if (process.env.NODE_ENV !== 'development') {
    base.push('Secure');
  }

  return base.concat(extras).join('; ');
}

function clearCookie(name) {
  return buildCookie(name, '', 0);
}

export function setSessionCookies(res, session) {
  const accessToken = session?.access_token || '';
  const refreshToken = session?.refresh_token || '';
  const accessMaxAge = Math.max((session?.expires_in || 0) - 30, 0);

  res.setHeader('Set-Cookie', [
    buildCookie(ACCESS_COOKIE, accessToken, accessMaxAge),
    buildCookie(REFRESH_COOKIE, refreshToken, SESSION_TTL_SECONDS)
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)]);
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, part) => {
    const trimmed = part.trim();
    if (!trimmed) return cookies;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return cookies;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function getSessionTokens(req) {
  const cookies = parseCookies(req);
  return {
    accessToken: cookies[ACCESS_COOKIE] || null,
    refreshToken: cookies[REFRESH_COOKIE] || null
  };
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (!origin || !host) return true;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    res.status(403).json({ error: 'Invalid origin' });
    return false;
  }

  if (parsedOrigin.host !== host) {
    res.status(403).json({ error: 'Cross-site request blocked' });
    return false;
  }

  return true;
}

export function applyNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

function sanitizeSession(session) {
  if (!session) return null;

  const payload = decodeJwtPayload(session.access_token || '');
  const expiresAt = session.expires_at || payload?.exp || null;
  const expiresIn = session.expires_in || (expiresAt ? Math.max(expiresAt - Math.floor(Date.now() / 1000), 0) : null);

  return {
    access_token: session.access_token,
    expires_at: expiresAt,
    expires_in: expiresIn,
    token_type: session.token_type,
    user: session.user
  };
}

export async function getSessionFromCookies(req, res) {
  const { accessToken, refreshToken } = getSessionTokens(req);

  if (!accessToken && !refreshToken) {
    return { session: null, error: null };
  }

  const supabase = createServerSupabaseClient();

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) {
      return {
        session: sanitizeSession({
          access_token: accessToken,
          expires_at: null,
          expires_in: null,
          token_type: 'bearer',
          user: data.user
        }),
        error: null
      };
    }
  }

  if (!refreshToken) {
    clearSessionCookies(res);
    return { session: null, error: null };
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data?.session) {
    clearSessionCookies(res);
    return { session: null, error: error || null };
  }

  setSessionCookies(res, data.session);
  return { session: sanitizeSession(data.session), error: null };
}

export function sendMethodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ error: 'Method not allowed' });
}
