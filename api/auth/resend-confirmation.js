import { applyNoStore, readJsonBody, requireSameOrigin, sendMethodNotAllowed } from '../../lib/serverAuth.js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EMAIL_DOMAIN = '@teb.edu.pl';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 12;
const MAX_ATTEMPTS_PER_EMAIL = 4;
const TOKEN_EXPIRY_MINUTES = 60;

// Shared pendingStore from signup.js – stores {email, password, fullName} by token
const pendingStore = globalThis.__tebPendingStore || new Map();
if (!globalThis.__tebPendingStore) globalThis.__tebPendingStore = pendingStore;

// Separate rate-limit store for resend endpoint
const resendRateStore = globalThis.__tebResendRateStore || new Map();
if (!globalThis.__tebResendRateStore) globalThis.__tebResendRateStore = resendRateStore;

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

// --- SMTP / mail helper (same as signup.js) ---

let smtpTransport = null;

function createMailTransport() {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !portStr || !user || !pass || !process.env.SMTP_FROM) {
    throw new Error('SMTP not configured');
  }
  const port = parseInt(portStr, 10);
  smtpTransport = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000, socketTimeout: 10000
  });
  return smtpTransport;
}

async function sendConfirmationEmail(toEmail, token) {
  const confirmUrl = `https://www.teb-app.pl/confirm?token=${token}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:0 auto;">
<div style="text-align:center;margin-bottom:30px;">
  <h2 style="color:#c8102e;">TEB-App</h2>
</div>
<h3 style="color:#333;">Witaj!</h3>
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

// --- Main handler ---

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

  // --- Rate limiting ---
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

  // --- Validation (always return 200 ok to avoid email enumeration) ---
  if (!email || !EMAIL_REGEX.test(email) || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return res.status(200).json({ ok: true });
  }

  try {
    // Search for existing pending entry by email to preserve password
    let existingEntry = null;
    let existingKey = null;
    for (const [key, val] of pendingStore.entries()) {
      if (key.startsWith('pending:') && val.email === email) {
        existingEntry = val;
        existingKey = key;
        break;
      }
    }

    // Generate a secure token (same as signup.js)
    const token = crypto.randomBytes(32).toString('hex');

    // Store pending confirmation; preserve password if we found it
    pendingStore.set(`pending:${token}`, {
      email,
      password: existingEntry?.password || '',
      fullName: existingEntry?.fullName || '',
      createdAt: now,
      expiresAt: now + TOKEN_EXPIRY_MINUTES * 60 * 1000
    });

    // Remove old token only AFTER new one is stored
    if (existingKey) pendingStore.delete(existingKey);

    // Send email via SMTP (same template as signup.js)
    await sendConfirmationEmail(email, token);

    console.log(`[RESEND CONFIRMATION] Email sent to ${maskEmail(email)}, token stored${existingEntry ? ' (preserved password)' : ' (no password found)'}`);
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('[RESEND CONFIRMATION EXCEPTION]', error);
    return res.status(200).json({ ok: true });
  }
}
