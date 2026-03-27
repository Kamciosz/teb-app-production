import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { generatePresignedUploadUrl } from '../lib/s3-client.js';

// This endpoint returns a presigned PUT URL and a public URL for the client to upload directly to R2.
// Expected: POST with optional JSON { fileType: 'image/webp' }
// Authorization: Bearer <access_token> (Supabase access token) or cookie-based Supabase session depending on deployment.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Basic auth: accept Authorization header Bearer <token>
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization token' });
  }

  // Validate user session via Supabase (server-side)
  try {
    // Use supabase-js directly to validate token without persisting session
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Server misconfiguration: missing Supabase keys' });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid Supabase token' });
    }

    const fileType = (req.body && req.body.fileType) || 'image/webp';
    // Generate unique key
    const { randomUUID } = await import('crypto');
    const key = `${randomUUID()}-${Date.now()}.webp`;

    const { signedUrl, publicUrl } = await generatePresignedUploadUrl({ key, contentType: fileType, expiresIn: 60 });

    return res.status(200).json({ uploadUrl: signedUrl, publicUrl, key, expiresIn: 60 });
  } catch (err) {
    console.error('generate-upload error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
