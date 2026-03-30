import { Resend } from 'resend';
import { applyNoStore, readJsonBody, requireSameOrigin, sendMethodNotAllowed } from '../lib/serverAuth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 50000;

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

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return res.status(503).json({ error: 'Email provider not configured' });
  }

  const body = await readJsonBody(req);
  const recipients = normalizeRecipients(body?.to).map((email) => email.trim().toLowerCase());
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const html = typeof body?.html === 'string' ? body.html : '';
  const text = typeof body?.text === 'string' ? body.text : '';

  const recipientError = validateRecipients(recipients);
  if (recipientError) {
    return res.status(400).json({ error: recipientError });
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
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: recipients,
      subject,
      html: html || undefined,
      text: text || undefined
    });

    return res.status(200).json({ ok: true, result });
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
