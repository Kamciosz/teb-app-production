import { generatePresignedUploadUrl } from '../lib/s3-client.js';

// POST /api/generate-upload
// Body: { fileType?: string, size?: number, context?: string }
// Auth: Authorization: Bearer <supabase access token>

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization token' });

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Server misconfiguration: missing Supabase keys' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Validate token and get user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid Supabase token' });
    const user = userData.user;

    // Fetch profile to determine roles
    const { data: profile, error: profErr } = await supabase.from('profiles').select('role, roles').eq('id', user.id).maybeSingle();
    const roles = (profile && (profile.roles || (profile.role ? [profile.role] : null))) || ['student'];

    // Quotas per role (per 24h)
    const QUOTAS = { admin: Infinity, tutor: 100, freelancer: 100, student: 20 };
    const MAX_UPLOAD_SIZE = { admin: 50 * 1024 * 1024, tutor: 10 * 1024 * 1024, freelancer: 10 * 1024 * 1024, student: 5 * 1024 * 1024 };

    function resolveQuota(rolesList) {
      if (!rolesList) return QUOTAS.student;
      if (rolesList.includes('admin')) return QUOTAS.admin;
      if (rolesList.includes('tutor')) return QUOTAS.tutor;
      if (rolesList.includes('freelancer')) return QUOTAS.freelancer;
      return QUOTAS.student;
    }

    function resolveMaxSize(rolesList) {
      if (!rolesList) return MAX_UPLOAD_SIZE.student;
      if (rolesList.includes('admin')) return MAX_UPLOAD_SIZE.admin;
      if (rolesList.includes('tutor')) return MAX_UPLOAD_SIZE.tutor;
      if (rolesList.includes('freelancer')) return MAX_UPLOAD_SIZE.freelancer;
      return MAX_UPLOAD_SIZE.student;
    }

    const quota = resolveQuota(roles);
    const maxSize = resolveMaxSize(roles);

    // Count uploads in the last 24 hours. Prefer dedicated `uploads` table if present, fallback to `rewear_posts`.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let used = 0;
    try {
      const { count } = await supabase.from('uploads').select('id', { count: 'exact' }).eq('user_id', user.id).gte('created_at', since);
      if (typeof count === 'number') used = count;
    } catch (e) {
      // Table might not exist; fallback
      try {
        const { count } = await supabase.from('rewear_posts').select('id', { count: 'exact' }).eq('seller_id', user.id).gte('created_at', since);
        if (typeof count === 'number') used = count;
      } catch (e2) {
        used = 0;
      }
    }

    if (quota !== Infinity && used >= quota) {
      return res.status(429).json({ error: 'Upload quota exceeded. Please try again later.' });
    }

    const body = req.body || {};
    const fileType = body.fileType || 'image/webp';
    const expectedSize = Number(body.size || 0);
    if (expectedSize && expectedSize > maxSize) {
      return res.status(413).json({ error: 'File too large for your account role.' });
    }

    const { randomUUID } = await import('crypto');
    const key = `${randomUUID()}-${Date.now()}.webp`;

    const { signedUrl, publicUrl } = await generatePresignedUploadUrl({ key, contentType: fileType, expiresIn: 60 });

    // Log issued upload (best-effort)
    try {
      await supabase.from('uploads').insert([{ user_id: user.id, key, public_url: publicUrl, status: 'issued', expected_size: expectedSize || null }]);
    } catch (e) {
      // ignore logging errors
    }

    return res.status(200).json({ uploadUrl: signedUrl, publicUrl, key, expiresIn: 60 });
  } catch (err) {
    console.error('generate-upload error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
