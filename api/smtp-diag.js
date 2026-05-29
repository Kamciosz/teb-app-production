import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const result = { timestamp: new Date().toISOString() };

  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  result.env = {
    host: host || 'MISSING',
    port: portStr || 'MISSING',
    user: user || 'MISSING',
    pass_len: pass ? pass.length : 0,
    from: from || 'MISSING',
    all_present: !!(host && portStr && user && pass && from)
  };

  if (!host || !portStr || !user || !pass) {
    return res.status(200).json(result);
  }

  try {
    const port = parseInt(portStr, 10);
    const transporter = nodemailer.createTransport({
      host, port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      socketTimeout: 10000
    });

    await transporter.verify();
    result.verify = 'ok';

    if (req.query.send === 'true') {
      const testTo = req.query.to || from;
      try {
        const info = await transporter.sendMail({
          from: `"TEB-App" <${from}>`,
          to: testTo,
          subject: `[TEST] SMTP ${new Date().toISOString()}`,
          html: '<h3>SMTP test OK</h3>'
        });
        result.send = { ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response };
      } catch (e) {
        result.send = { ok: false, error: e.message, code: e.code, command: e.command };
      }
    } else {
      result.send = 'skipped (?send=true)';
    }

    return res.status(200).json(result);
  } catch (error) {
    result.error = { message: error.message, code: error.code };
    return res.status(500).json(result);
  }
}
