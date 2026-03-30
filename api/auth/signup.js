import {
  applyNoStore,
  createServerSupabaseClient,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed,
  setSessionCookies
} from '../../lib/serverAuth.js';
import { createClient } from '@supabase/supabase-js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';

function shouldBypassEmailConfirmation() {
  const bypassEnabled = process.env.AUTH_BYPASS_CONFIRMATION_ON_LIMIT;
  const wantsBypass = bypassEnabled === '1' || bypassEnabled === 'true';

  if (!wantsBypass) return false;

  const isProduction = process.env.NODE_ENV === 'production';
  const explicitProdAllow = process.env.AUTH_BYPASS_ALLOW_IN_PRODUCTION;
  const allowInProduction = explicitProdAllow === '1' || explicitProdAllow === 'true';

  if (isProduction && !allowInProduction) {
    return false;
  }

  return true;
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex <= 1) return `***${email.slice(atIndex)}`;
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`;
}

function createServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
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
        if (shouldBypassEmailConfirmation()) {
          const serviceClient = createServiceRoleClient();
          if (!serviceClient) {
            return res.status(503).json({
              error: 'Brak konfiguracji obejscia limitu maili (SUPABASE_SERVICE_ROLE_KEY).'
            });
          }

          const { data: adminData, error: adminError } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: fullName || null
            }
          });

          if (adminError) {
            const adminMessage = String(adminError.message || '').toLowerCase();
            if (adminMessage.includes('already') || adminMessage.includes('registered')) {
              return res.status(409).json({ error: 'Ten e-mail jest juz zarejestrowany.' });
            }
            console.error(`[SIGNUP BYPASS ERROR] email=${maskEmail(email)}, error=${adminError.message}`, adminError);
            return res.status(503).json({ error: 'Nie udalo sie utworzyc konta w trybie awaryjnym.' });
          }

          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError || !signInData?.session) {
            console.error(`[SIGNUP BYPASS SIGNIN ERROR] email=${maskEmail(email)}, error=${signInError?.message}`);
            return res.status(201).json({
              user: adminData?.user || null,
              session: null,
              note: 'Konto utworzone, ale automatyczne logowanie nie powiodlo sie.'
            });
          }

          setSessionCookies(res, signInData.session);
          return res.status(200).json({
            user: signInData.user || adminData?.user || null,
            session: toClientSession(signInData.session),
            fallbackUsed: true
          });
        }

        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna: problem z wysyłką maila potwierdzającego. Spróbuj ponownie za chwilę.' });
      }
      if (String(error.message || '').toLowerCase().includes('already registered')) {
        return res.status(409).json({ error: 'Ten e-mail jest już zarejestrowany.' });
      }
      return res.status(400).json({ error: error.message || 'Błąd rejestracji' });
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
