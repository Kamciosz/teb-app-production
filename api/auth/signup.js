import { applyNoStore, readJsonBody, sendMethodNotAllowed } from '../../lib/serverAuth.js';
import errorLog from '../../lib/errorLog.js';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 80;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const TOKEN_EXPIRY_MINUTES = 60;

const signupStore = globalThis.__tebSignupStore || new Map();
if (!globalThis.__tebSignupStore) globalThis.__tebSignupStore = signupStore;

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex <= 1) return `***${email.slice(atIndex)}`;
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`;
}

function pruneStore(now) {
  for (const [key, state] of signupStore.entries()) {
    if (!state || state.expiresAt <= now) signupStore.delete(key);
  }
}

function registerAttempt(key, limit, now) {
  const existing = signupStore.get(key);
  if (!existing || existing.resetAt <= now) {
    signupStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  signupStore.set(key, existing);
  return existing.count > limit;
}

let smtpTransport = null;
function createMailTransport() {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !portStr || !user || !pass || !process.env.SMTP_FROM) throw new Error('SMTP not configured');
  const port = parseInt(portStr, 10);
  smtpTransport = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000, socketTimeout: 10000
  });
  return smtpTransport;
}

async function sendSignupEmail(toEmail, token, fullName) {
  const confirmUrl = `https://www.teb-app.pl/confirm?token=${token}`;
  const firstName = fullName ? fullName.split(' ')[0] : '';
  
  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:0 auto;">
<div style="text-align:center;margin-bottom:30px;">
  <h2 style="color:#c8102e;">TEB-App</h2>
</div>
<h3 style="color:#333;">Witaj${firstName ? ' ' + firstName : ''}!</h3>
<p>Kliknij poniższy przycisk, aby <strong>aktywować konto</strong> w TEB-App:</p>
<div style="text-align:center;margin:30px 0;">
  <a href="${confirmUrl}" style="display:inline-block;padding:14px 36px;background:#c8102e;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Aktywuj konto</a>
</div>
<p style="color:#666;font-size:13px;">Link wygasa za ${TOKEN_EXPIRY_MINUTES} minut. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.</p>
<p style="color:#666;font-size:13px;">📧 Wiadomość może trafić do folderu SPAM — sprawdź go, jeśli nie widzisz maila w skrzynce odbiorczej.</p>
<hr style="border:1px solid #eee;margin:20px 0;">
<p style="color:#999;font-size:12px;">TEB-App — portal szkolny dla uczniów TEB Warszawa</p>
</body></html>`;

  const fromEmail = process.env.SMTP_FROM;
  const transporter = createMailTransport();
  await transporter.sendMail({
    from: `"TEB-App" <${fromEmail}>`,
    to: toEmail,
    subject: 'Aktywuj konto w TEB-App',
    html
  });
}

export default async function handler(req, res) {
  applyNoStore(res);
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(500).json({ error: 'Internal server error' }); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const now = Date.now();

  pruneStore(now);

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) return res.status(400).json({ error: `Only ${ALLOWED_EMAIL_DOMAIN} addresses are allowed` });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  if (fullName.length > MAX_NAME_LENGTH) return res.status(400).json({ error: `Full name must be at most ${MAX_NAME_LENGTH} characters` });

  if (registerAttempt(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  try {
    // Check if user already exists in Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Server configuration error' });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Check if email already taken
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
    const alreadyExists = existingUsers?.users?.some(u => u.email === email);
    if (alreadyExists) {
      return res.status(200).json({
        user: null, session: null,
        note: 'Jeśli konto istnieje, sprawdź e-mail lub zaloguj się.'
      });
    }

    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store pending signup (in memory - survives ~60min)
    signupStore.set(`pending:${token}`, {
      email, password, fullName,
      createdAt: now,
      expiresAt: now + TOKEN_EXPIRY_MINUTES * 60 * 1000
    });

    // Send email with confirmation link
    await sendSignupEmail(email, token, fullName);
    
    console.log(`[SIGNUP] Email sent to ${maskEmail(email)}, token stored`);

    return res.status(200).json({
      user: null, session: null,
      note: '✅ Wysłaliśmy link aktywacyjny na Twój e-mail. Kliknij go, aby utworzyć konto. Sprawdź też folder SPAM/Oferty.'
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
