export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const result = {
    timestamp: new Date().toISOString(),
    env_check: {}
  };

  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  result.env_check = {
    host: host || 'MISSING',
    port: portStr || 'MISSING',
    user: user || 'MISSING',
    pass_len: pass ? pass.length : 0,
    pass_present: !!pass,
    from: from || 'MISSING',
    all_present: !!(host && portStr && user && pass && from)
  };

  if (!host || !portStr || !user || !pass) {
    result.message = 'SMTP vars incomplete';
    return res.status(200).json(result);
  }

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default?.createTransport || nodemailer.createTransport;
    if (!transport) {
      result.error = 'createTransport not found. Keys: ' + Object.keys(nodemailer).join(',');
      return res.status(500).json(result);
    }

    const port = parseInt(portStr, 10);
    const transporter = transport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      socketTimeout: 10000
    });

    const verifyStart = Date.now();
    await transporter.verify();
    result.verify = { ok: true, ms: Date.now() - verifyStart };

    if (req.query.send === 'true') {
      const testTo = req.query.to || from;
      const sendStart = Date.now();
      try {
        const info = await transporter.sendMail({
          from: `"TEB-App Test" <${from}>`,
          to: testTo,
          subject: `[TEST] SMTP diagnostic ${new Date().toISOString()}`,
          html: '<h3>SMTP test passed</h3><p>Email sending works.</p>'
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
      result.send_test = { skipped: true, note: 'Add ?send=true to test. Add ?to=email to test specific recipient.' };
    }

    return res.status(200).json(result);
  } catch (error) {
    result.error = { message: error.message, code: error.code, stack: error.stack?.slice(0, 500) };
    return res.status(500).json(result);
  }
}
