import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/**
 * Compress and upload an image to R2 via the server-side presigner endpoint.
 * Returns the public URL of the uploaded image.
 *
 * Expects a server endpoint at `/api/generate-upload` that returns { uploadUrl, publicUrl }
 */
export async function uploadImageToR2(file, { maxSizeMB = 1, maxWidthOrHeight = 1920 } = {}) {
  if (!file) throw new Error('No file provided');

  const options = {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/webp',
  };

  const compressedFile = await imageCompression(file, options);

  // Get current Supabase session token for authorization
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch (err) {
    console.warn('Could not read Supabase session token:', err?.message || err);
  }

  const res = await fetch('/api/generate-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fileType: 'image/webp', size: compressedFile.size }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error('Failed to obtain presigned upload URL: ' + (text || res.status));
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const body = await res.json();
  const { uploadUrl, publicUrl } = body;

  // Upload compressed blob via PUT
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/webp',
    },
    body: compressedFile,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    const err = new Error('Upload to R2 failed: ' + (text || uploadRes.status));
    err.status = uploadRes.status;
    err.body = text;
    throw err;
  }

  return publicUrl;
}
