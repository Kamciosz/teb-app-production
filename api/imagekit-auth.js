import { createHmac, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getSessionFromCookies } from '../lib/serverAuth.js';

// GET /api/imagekit-auth
// Returns authentication parameters for browser direct upload to ImageKit.
// Generates params manually using Node.js built-in crypto — no external package needed.
// Hardening: folder allowlist, per-IP rate limiting (in-memory), requires Supabase JWT.
const ALLOWED_FOLDERS = new Set(['profiles', 'rewear', 'tebtalk', 'articles', 'general']);
const RATE_LIMIT_WINDOW_MS = 10 * 1000; // 10s
const RATE_LIMIT_MAX = 5;

const rateLimit = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require a valid Supabase session JWT — unauthenticated callers cannot upload
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase config' });
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  let user = null;

  if (token) {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (!authError) {
      user = authData?.user || null;
    }
  }

  if (!user) {
    const { session } = await getSessionFromCookies(req, res);
    user = session?.user || null;
  }

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!publicKey || !privateKey || !urlEndpoint) {
    return res.status(500).json({ error: 'Server misconfiguration: missing ImageKit keys' });
  }

  // Basic per-IP rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const entry = rateLimit.get(ip) || { count: 0, ts: now };
  if (entry.ts + RATE_LIMIT_WINDOW_MS > now) {
    if (entry.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    entry.count += 1;
  } else {
    entry.count = 1;
    entry.ts = now;
  }
  rateLimit.set(ip, entry);

  const folder = req.query?.folder || (req.body && req.body.folder) || '';
  if (folder && !ALLOWED_FOLDERS.has(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  try {
    // Generate ImageKit authentication parameters using built-in crypto
    const token = randomBytes(16).toString('hex');
    const expire = Math.floor(Date.now() / 1000) + 2400; // valid 40 min (must be < 1h per ImageKit docs)
    const signature = createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex');

    return res.status(200).json({ publicKey, urlEndpoint, token, expire, signature });
  } catch (err) {
    console.error('imagekit-auth error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
