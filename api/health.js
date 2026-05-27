import { applyNoStore } from '../lib/serverAuth.js';
import nodemailer from 'nodemailer';

async function checkSupabase() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return { status: 'fail', detail: 'SUPABASE_URL not set' };

    // Try resolving the Supabase project health endpoint
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.ok ? 'ok' : 'degraded', detail: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'fail', detail: error.message };
  }
}

async function checkSmtp() {
  try {
    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !portStr || !user || !pass) {
      return { status: 'fail', detail: 'SMTP env vars incomplete' };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(portStr, 10),
      secure: parseInt(portStr, 10) === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      socketTimeout: 5000
    });

    await transporter.verify();
    return { status: 'ok', detail: 'SMTP verified' };
  } catch (error) {
    return { status: 'fail', detail: error.message };
  }
}

function checkEnv() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(key => !process.env[key]);
  const supabaseUrl = !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    status: missing.length === 0 ? 'ok' : 'degraded',
    detail: {
      smtp_configured: missing.length === 0,
      missing_smtp_vars: missing,
      supabase_url_configured: supabaseUrl,
      service_role_key_configured: serviceRoleKey
    }
  };
}

export default async function handler(req, res) {
  applyNoStore(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [supabaseResult, smtpResult] = await Promise.allSettled([
    checkSupabase(),
    checkSmtp()
  ]);

  const envResult = checkEnv();

  const checks = {
    supabase: supabaseResult.status === 'fulfilled' ? supabaseResult.value : { status: 'error', detail: 'check threw' },
    smtp: smtpResult.status === 'fulfilled' ? smtpResult.value : { status: 'error', detail: 'check threw' },
    env: envResult
  };

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const overallStatus = allOk ? 'ok' : 'degraded';

  console.log(`[HEALTH] status=${overallStatus}, supabase=${checks.supabase.status}, smtp=${checks.smtp.status}, env=${checks.env.status}`);

  return res.status(allOk ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks
  });
}
