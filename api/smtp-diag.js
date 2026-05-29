import nodemailer from 'nodemailer';
import { applyNoStore } from '../../lib/serverAuth.js';

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = {
    timestamp: new Date().toISOString(),
    env_check: {},
    verify: null,
    send_test: null
  };

  // 1. Check env vars (masked)
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  result.env_check = {
    host: host || 'MISSING',
    port: portStr || 'MISSING',
    user: user || 'MISSING',
    pass: pass ? `***(${pass.length} chars)` : 'MISSING',
    from: from || 'MISSING',
    all_present: !!(host && portStr && user && pass && from)
  };

  if (!host || !portStr || !user || !pass) {
    return res.status(500).json(result);
  }

  const port = parseInt(portStr, 10);

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      socketTimeout: 10000
    });

    // 2. Verify connection
    const verifyStart = Date.now();
    await transporter.verify();
    result.verify = { ok: true, ms: Date.now() - verifyStart };

    // 3. Try sending test email to the FROM address (loopback test)
    if (req.query.send === 'true') {
      const testTo = req.query.to || from; // send to self by default
      const sendStart = Date.now();
      try {
        const info = await transporter.sendMail({
          from: `"TEB-App Diagnostic" <${from}>`,
          to: testTo,
          subject: `[TEST] TEB-App SMTP diagnostic ${new Date().toISOString()}`,
          html: '<h3>SMTP test passed</h3><p>If you see this, email sending works.</p>'
        });
        result.send_test = {
          ok: true,
          ms: Date.now() - sendStart,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response
        };
      } catch (sendErr) {
        result.send_test = {
          ok: false,
          ms: Date.now() - sendStart,
          error: sendErr.message,
          code: sendErr.code,
          command: sendErr.command,
          responseCode: sendErr.responseCode
        };
      }
    } else {
      result.send_test = { skipped: true, note: 'Add ?send=true to test sending. Add ?to=email@test.com to test specific recipient.' };
    }

    return res.status(200).json(result);
  } catch (error) {
    result.verify = { ok: false, error: error.message, code: error.code, command: error.command };
    return res.status(500).json(result);
  }
}
