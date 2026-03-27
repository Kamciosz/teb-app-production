// Serverless endpoint: /api/send-email
// Usage: POST { to, subject, html, text }
// Requires environment variables: RESEND_API_KEY, RESEND_FROM

import Resend from 'resend'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Parse body (compat for frameworks that don't auto-parse)
  const body = req.body || (await new Promise((resolve) => {
    let data = ''
    req.on && req.on('data', chunk => (data += chunk))
    req.on && req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch (e) { resolve({}) }
    })
  }))

  const { to, subject, html, text } = body || {}

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY missing; cannot send email')
    return res.status(503).json({ error: 'Email provider not configured' })
  }

  if (!process.env.RESEND_FROM) {
    console.error('RESEND_FROM missing; sender address is not configured')
    return res.status(503).json({ error: 'Sender address not configured' })
  }

  if (!to) {
    return res.status(400).json({ error: 'Missing "to" field' })
  }

  if (!subject && !html && !text) {
    return res.status(400).json({ error: 'Missing content: provide subject and html or text' })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: Array.isArray(to) ? to : [to],
      subject: subject || '(no subject)',
      html: html,
      text: text
    })

    return res.status(200).json({ ok: true, result })
  } catch (err) {
    console.error('Resend send error:', err)
    const status = err?.status || err?.statusCode || err?.response?.status || 500
    const message = err?.message || err?.response?.data || 'Failed to send email'

    if (status === 429) {
      return res.status(429).json({ error: 'Rate limited by email provider', detail: message })
    }

    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'Email provider authentication failed', detail: message })
    }

    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'Email send failed', detail: message })
  }
}
export default function handler(req,res){res.end("ok")}
