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

async function sendConfirmationEmail(email, confirmationUrl) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM || 'noreply@teb.edu.pl';
  const fromName = 'TEB-App';

  if (!apiKey) {
    console.error('[EMAIL] BREVO_API_KEY not set');
    return false;
  }

  const payload = JSON.stringify({
    sender: { name: fromName, email: fromEmail },
    to: [{ email }],
    subject: 'Potwierdź rejestrację w TEB-App',
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Witaj w TEB-App!</h2>
  <p>Kliknij poniższy link aby potwierdzić swoją rejestrację:</p>
  <a href="${confirmationUrl}" style="display:inline-block;padding:12px 24px;background:#c8102e;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Potwierdź e-mail</a>
  <p style="color:#666;margin-top:20px;">Link wygasa za 24 godziny. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
</body>
</html>`
  });

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: payload
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[EMAIL] Brevo error ${resp.status}: ${err}`);
      return false;
    }
    console.log(`[EMAIL] Sent confirmation to ${maskEmail(email)}, messageId: ${(await resp.json()).messageId}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Failed to send: ${error.message}`);
    return false;
  }
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

    // Create user with email_confirm: false — they must verify email
    const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName || null }
    });

    if (createError) {
      console.error(`[SIGNUP ERROR] email=${maskEmail(email)}, error=${createError.message}`);

      if (String(createError.message || '').toLowerCase().includes('confirmation email')) {
        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna. Spróbuj ponownie za chwilę.' });
      }
      const errorMsg = String(createError.message || createError.msg || '').toLowerCase();
      if (errorMsg.includes('already been registered') || errorMsg.includes('already registered') || errorMsg.includes('email_exists') || errorMsg.includes('user already exists')) {
        return res.status(200).json({
          user: null, session: null,
          note: 'Konto o tym adresie e-mail już istnieje. Zaloguj się zamiast rejestrować.',
          alreadyExists: true
        });
      }
      return res.status(400).json({ error: 'Rejestracja nie powiodła się. Sprawdź dane i spróbuj ponownie.' });
    }

    const userId = createData?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Generate confirmation link
    const baseUrl = resolveBaseUrl(req) || 'https://teb-app-production.vercel.app';
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'signup',
      email,
      options: { redirectTo: baseUrl }
    });

    if (linkError) {
      console.error(`[SIGNUP LINK ERROR] ${maskEmail(email)}: ${linkError.message}`);
      return res.status(200).json({
        user: createData.user,
        session: null,
        note: 'Konto utworzone, ale nie udało się wysłać e-maila potwierdzającego. Skontaktuj się z administratorem.'
      });
    }

    // Send email via Brevo
    const confirmationUrl = linkData?.properties?.action_link || `${baseUrl}/auth/confirm?token=${userId}`;
    const emailSent = await sendConfirmationEmail(email, confirmationUrl);

    console.log(`[SIGNUP SUCCESS] email=${maskEmail(email)}, userId=${userId}, emailSent=${emailSent}`);

    return res.status(200).json({
      user: createData.user,
      session: null,
      note: emailSent
        ? 'Konto utworzone! Sprawdź e-mail aby potwierdzić rejestrację.'
        : 'Konto utworzone! E-mail potwierdzający zostanie wysłany wkrótce.'
    });
  } catch (error) {
    console.error('[SIGNUP EXCEPTION]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
