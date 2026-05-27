import {
  applyNoStore,
  readJsonBody,
  requireSameOrigin,
  sendMethodNotAllowed
} from '../../lib/serverAuth.js';
import errorLog from '../../lib/errorLog.js';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_EMAIL = 5;

/*
 * Rate limiting: in-memory Map (globalThis).
 *
 * TODO: Migrate to Vercel KV (@vercel/kv) for persistence across cold starts.
 * Vercel KV is Redis-backed and available on Hobby plan.
 * Replace globalThis Map with:
 *   import { kv } from '@vercel/kv';
 *   const key = `ratelimit:signup:ip:${clientIp}`;
 *   const count = await kv.incr(key);
 *   if (count === 1) await kv.expire(key, RATE_WINDOW_MS / 1000);
 *
 * In-memory is acceptable for ~1000 students because Vercel Functions
 * rarely cold-start in production with warm traffic. If scaling up,
 * enable Vercel KV in Vercel dashboard, add KV_URL to env, and swap.
 */
const signupRateStore = globalThis.__tebSignupRateStore || new Map();
if (!globalThis.__tebSignupRateStore) {
  globalThis.__tebSignupRateStore = signupRateStore;
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length > 0) return String(xff[0]).split(',')[0].trim();
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
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

// SMTP singleton — reuse transport across calls
let smtpTransport = null;
function createMailTransport() {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !portStr || !user || !pass || !process.env.SMTP_FROM) {
    console.error('[EMAIL] SMTP environment variables missing');
    throw new Error('SMTP not configured');
  }

  const port = parseInt(portStr, 10);
  smtpTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    socketTimeout: 8000
  });
  return smtpTransport;
}

async function sendConfirmationEmail(toEmail, subject, htmlContent) {
  try {
    const fromEmail = process.env.SMTP_FROM;
    const transporter = createMailTransport();
    const info = await transporter.sendMail({
      from: `"TEB-App" <${fromEmail}>`,
      to: toEmail,
      subject,
      html: htmlContent
    });
    console.log(`[EMAIL] Sent to ${maskEmail(toEmail)}, msgId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Error: ${error.message}`);
    return false;
  }
}

async function sendAdminNotification(userEmail, fullName) {
  try {
    const transporter = createMailTransport();
    const fromEmail = process.env.SMTP_FROM;
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
    const now = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    await transporter.sendMail({
      from: `"TEB-App" <${fromEmail}>`,
      to: adminEmail,
      subject: 'Nowy użytkownik w TEB-App',
      html: `<h3>Nowa rejestracja</h3>
<p><strong>Email:</strong> ${maskEmail(userEmail)}</p>
<p><strong>Imię i nazwisko:</strong> ${fullName || 'nie podano'}</p>
<p><strong>Data:</strong> ${now}</p>`
    });
    console.log(`[ADMIN NOTIFY] Sent to ${adminEmail} for ${maskEmail(userEmail)}`);
  } catch (error) {
    console.error(`[ADMIN NOTIFY] Error: ${error.message}`);
  }
}

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error?.statusCode === 413) return res.status(413).json({ error: 'Payload too large' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const now = Date.now();

  pruneRateStore(now);
  const clientIp = getClientIp(req);
  const ipRate = registerAttemptAndCheck(`ip:${clientIp}`, MAX_ATTEMPTS_PER_IP, now);
  if (ipRate.blocked) {
    res.setHeader('Retry-After', String(ipRate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
  }

  if (email) {
    const emailRate = registerAttemptAndCheck(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now);
    if (emailRate.blocked) {
      res.setHeader('Retry-After', String(emailRate.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
    }
  }

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) return res.status(400).json({ error: `Only ${ALLOWED_EMAIL_DOMAIN} addresses are allowed` });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  if (fullName.length > MAX_NAME_LENGTH) return res.status(400).json({ error: `Full name must be at most ${MAX_NAME_LENGTH} characters` });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Create user — NOT confirmed, must verify email
    const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName || null }
    });

    if (createError) {
      console.error(`[SIGNUP ERROR] email=${maskEmail(email)}, msg=${createError.message}`);

      if (String(createError.message || '').toLowerCase().includes('confirmation email')) {
        return res.status(503).json({ error: 'Rejestracja chwilowo niedostępna. Spróbuj ponownie za chwilę.' });
      }
      const errMsg = String(createError.message || createError.msg || '').toLowerCase();
      if (errMsg.includes('already been registered') || errMsg.includes('already registered')
        || errMsg.includes('email_exists') || errMsg.includes('user already exists')) {
        return res.status(200).json({
          user: null, session: null,
          note: 'Jeśli konto istnieje, sprawdź e-mail lub zaloguj się.'
        });
      }
      return res.status(400).json({ error: 'Rejestracja nie powiodła się. Sprawdź dane i spróbuj ponownie.' });
    }

    const userId = createData?.user?.id;
    if (!userId) return res.status(500).json({ error: 'Failed to create user' });

    // Generate confirmation link via Supabase
    const baseUrl = resolveBaseUrl(req) || 'https://teb-app-production.vercel.app';
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { redirectTo: baseUrl }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error(`[SIGNUP LINK ERROR] ${maskEmail(email)}: ${linkError?.message || 'no action_link'}`);
      return res.status(500).json({ error: 'Nie udało się wygenerować linku potwierdzającego. Skontaktuj się z administratorem.' });
    }

    const confirmationUrl = linkData.properties.action_link;

    // Send email via Brevo
    const emailHtml = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:0 auto;">
<div style="text-align:center;margin-bottom:30px;">
  <h2 style="color:#c8102e;">TEB-App</h2>
</div>
<h3 style="color:#333;">Witaj${fullName ? ' ' + fullName.split(' ')[0] : ''}!</h3>
<p>Dziękujemy za rejestrację w <strong>TEB-App</strong>. Kliknij poniższy przycisk aby potwierdzić swój adres e-mail i aktywować konto:</p>
<div style="text-align:center;margin:30px 0;">
  <a href="${confirmationUrl}" style="display:inline-block;padding:14px 36px;background:#c8102e;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Potwierdź e-mail</a>
</div>
<p style="color:#666;font-size:13px;">Link wygasa za 24 godziny. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
<hr style="border:1px solid #eee;margin:20px 0;">
<p style="color:#999;font-size:12px;">TEB-App — portal szkolny dla uczniów TEB Warszawa</p>
</body></html>`;

    const emailSent = await sendConfirmationEmail(email, 'Potwierdź rejestrację w TEB-App', emailHtml);

    // Notify admin about new registration
    await sendAdminNotification(email, fullName);

    console.log(`[SIGNUP SUCCESS] email=${maskEmail(email)}, userId=${userId}, emailSent=${emailSent}`);

    return res.status(200).json({
      user: { id: createData.user.id, email: createData.user.email },
      session: null,
      note: emailSent
        ? 'Konto utworzone! Sprawdź swoją skrzynkę e-mail i kliknij link potwierdzający.'
        : 'Konto utworzone! E-mail potwierdzający zostanie wysłany wkrótce. Jeśli nie dotrze, skontaktuj się z administratorem.'
    });

  } catch (error) {
    console.error('[SIGNUP EXCEPTION]', error);
    await errorLog.log('error', 'signup', error.message, {
      stack: error.stack?.slice(0, 500),
      email: maskEmail(email)
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
