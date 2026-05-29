import { applyNoStore, sendMethodNotAllowed, requireSameOrigin } from '../../lib/serverAuth.js';
import { createClient } from '@supabase/supabase-js';
import errorLog from '../../lib/errorLog.js';

const signupStore = globalThis.__tebSignupStore || new Map();

export default async function handler(req, res) {
  applyNoStore(res);
  requireSameOrigin(req, res);

  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  if (!token || token.length < 10) {
    return res.status(400).json({ error: 'Invalid or missing token' });
  }

  const pending = signupStore.get(`pending:${token}`);

  if (!pending) {
    return res.status(410).json({ error: 'Link wygasł lub jest nieprawidłowy. Zarejestruj się ponownie.' });
  }

  if (pending.expiresAt <= Date.now()) {
    signupStore.delete(`pending:${token}`);
    return res.status(410).json({ error: 'Link wygasł. Zarejestruj się ponownie.' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Create user with email already confirmed
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: pending.email,
      password: pending.password,
      email_confirm: true,
      user_metadata: { full_name: pending.fullName || null }
    });

    if (error) {
      console.error('[CONFIRM] createUser error:', error.message);
      
      if (error.message?.toLowerCase().includes('already registered')) {
        signupStore.delete(`pending:${token}`);
        return res.status(200).json({
          ok: true,
          message: 'Konto już istnieje. Możesz się zalogować.'
        });
      }
      
      return res.status(500).json({ error: 'Nie udało się utworzyć konta. Spróbuj ponownie.' });
    }

    // Clean up token
    signupStore.delete(`pending:${token}`);

    console.log(`[CONFIRM] User created: ${pending.email}`);

    return res.status(200).json({
      ok: true,
      message: 'Konto utworzone! Możesz się zalogować.',
      email: pending.email
    });

  } catch (error) {
    await errorLog.log('error', 'confirm-signup', error.message, { stack: error.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
