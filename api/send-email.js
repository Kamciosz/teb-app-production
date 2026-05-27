import { Resend } from 'resend';
import { applyNoStore, readJsonBody, requireSameOrigin, sendMethodNotAllowed, getSessionFromCookies } from '../lib/serverAuth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 50000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_RECIPIENT = 8;
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailRateStore = globalThis.__tebSendEmailRateStore || new Map();
if (!globalThis.__tebSendEmailRateStore) {
  globalThis.__tebSendEmailRateStore = emailRateStore;
}

function getClientIp(req) {
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) return xRealIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length > 0) return String(xff[0]).split(',')[0].trim();
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function pruneRateStore(now) {
  for (const [key, state] of emailRateStore.entries()) {
    if (!state || state.resetAt <= now) emailRateStore.delete(key);
  }
}

function registerAttemptAndCheck(key, limit, now) {
  const existing = emailRateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const state = { count: 1, resetAt: now + RATE_WINDOW_MS };
    emailRateStore.set(key, state);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  emailRateStore.set(key, existing);
  if (existing.count > limit) {
    return { blocked: true, retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1) };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

function resolveProviderOrder() {
  const configured = String(process.env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  if (configured === 'brevo') return ['brevo'];
  if (configured === 'resend') return ['resend'];
  return ['brevo', 'resend'];
}

function canUseBrevo() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM);
}

function canUseResend() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

async function sendWithBrevo({ recipients, subject, html, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_FROM },
      to: recipients.map((email) => ({ email })),
      subject,
      ...(html ? { htmlContent: html } : {}),
      ...(text ? { textContent: text } : {})
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || 'Brevo send failed');
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function sendWithResend({ recipients, subject, html, text }) {
  return resendClient.emails.send({
    from: process.env.RESEND_FROM,
    to: recipients,
    subject,
    html: html || undefined,
    text: text || undefined
  });
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function validateRecipients(recipients) {
  if (!recipients.length) {
    return 'Missing "to" field';
  }

  for (const recipient of recipients) {
    if (typeof recipient !== 'string' || !EMAIL_REGEX.test(recipient.trim())) {
      return `Invalid email address: ${recipient}`;
    }
  }

  return null;
}

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res, ['POST']);
  }

  if (!requireSameOrigin(req, res)) {
    return;
  }

  // Require authenticated session
  const { session, error: sessionError } = await getSessionFromCookies(req, res);
  if (sessionError || !session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userRoles = session.user?.user_metadata?.roles || ['student'];
  const isAdmin = Array.isArray(userRoles) && userRoles.some(r => ['admin', 'moderator_users'].includes(r));
  if (!isAdmin) {
    return res.status(403).json({ error: 'Forbidden: admin or moderator role required' });
  }

  if (!canUseBrevo() && !canUseResend()) {
    return res.status(503).json({ error: 'Email provider not configured' });
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
  const recipients = normalizeRecipients(body?.to).map((email) => email.trim().toLowerCase());
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const html = typeof body?.html === 'string' ? body.html : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  const now = Date.now();

  pruneRateStore(now);
  const ipRate = registerAttemptAndCheck(`ip:${getClientIp(req)}`, MAX_ATTEMPTS_PER_IP, now);
  if (ipRate.blocked) {
    res.setHeader('Retry-After', String(ipRate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many email requests. Please try again later.' });
  }

  const recipientError = validateRecipients(recipients);
  if (recipientError) {
    return res.status(400).json({ error: recipientError });
  }

  for (const recipient of recipients) {
    const recipientRate = registerAttemptAndCheck(`recipient:${recipient}`, MAX_ATTEMPTS_PER_RECIPIENT, now);
    if (recipientRate.blocked) {
      res.setHeader('Retry-After', String(recipientRate.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many messages to this recipient. Please try again later.' });
    }
  }

  if (!subject) {
    return res.status(400).json({ error: 'Missing "subject" field' });
  }

  if (!html && !text) {
    return res.status(400).json({ error: 'Missing content: provide html or text' });
  }

  if (subject.length > SUBJECT_MAX_LENGTH) {
    return res.status(400).json({ error: `Subject exceeds max length of ${SUBJECT_MAX_LENGTH} characters` });
  }

  if (html.length > BODY_MAX_LENGTH || text.length > BODY_MAX_LENGTH) {
    return res.status(400).json({ error: `Message content exceeds max length of ${BODY_MAX_LENGTH} characters` });
  }

  try {
    const providers = resolveProviderOrder();
    const providerErrors = [];

    for (const provider of providers) {
      try {
        if (provider === 'brevo' && canUseBrevo()) {
          const result = await sendWithBrevo({ recipients, subject, html, text });
          return res.status(200).json({ ok: true, provider: 'brevo', result });
        }

        if (provider === 'resend' && canUseResend()) {
          const result = await sendWithResend({ recipients, subject, html, text });
          return res.status(200).json({ ok: true, provider: 'resend', result });
        }
      } catch (providerError) {
        providerErrors.push(providerError);
      }
    }

    const finalError = providerErrors[providerErrors.length - 1] || new Error('Email send failed');
    const status = finalError?.statusCode || finalError?.status || finalError?.response?.status || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;

    if (safeStatus === 429) {
      return res.status(429).json({ error: 'Rate limited by email provider' });
    }

    if (safeStatus === 401 || safeStatus === 403) {
      return res.status(502).json({ error: 'Email provider authentication failed' });
    }

    console.error('send-email provider error', finalError);
    return res.status(safeStatus).json({ error: 'Email send failed' });
  } catch (error) {
    const status = error?.statusCode || error?.status || error?.response?.status || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;

    if (safeStatus === 429) {
      return res.status(429).json({ error: 'Rate limited by email provider' });
    }

    if (safeStatus === 401 || safeStatus === 403) {
      return res.status(502).json({ error: 'Email provider authentication failed' });
    }

    console.error('send-email error', error);
    return res.status(safeStatus).json({ error: 'Email send failed' });
  }
}
