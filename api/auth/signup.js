import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;

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

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
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
      if (String(error.message || '').toLowerCase().includes('confirmation email')) {
        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna: problem z wysyłką maila potwierdzającego. Spróbuj ponownie za chwilę.' });
      }
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ user: data?.user || null, session: null });
  } catch (error) {
    console.error('auth/signup error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
