import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.warn('R2 environment variables are not fully configured. lib/s3-client will still export helpers but calls may fail.');
}

const endpoint = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined;

export const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY ? {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  } : undefined,
  forcePathStyle: false,
});

export async function generatePresignedUploadUrl({ key, contentType = 'image/webp', expiresIn = 60 }) {
  if (!key) throw new Error('Missing key for presigned URL');
  const command = new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: contentType });
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.VITE_R2_PUBLIC_URL || '';
  const publicUrl = (publicBase.replace(/\/+$/, '')) + '/' + encodeURIComponent(key);
  return { signedUrl, publicUrl };
}
