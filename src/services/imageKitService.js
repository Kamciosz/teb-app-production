import { uploadImageToR2 } from './r2Upload';

const R2_PUBLIC = import.meta.env.VITE_R2_PUBLIC_URL || import.meta.env.NEXT_PUBLIC_R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || '';

// Unified media service. When Cloudflare R2 is configured, upload goes to R2.
export const ImageKitService = {
    upload: async (file, fileName, folder = 'general') => {
        if (R2_PUBLIC) {
            // r2Upload handles compression and upload; if file is already compressed, it will recompress according to options
            return await uploadImageToR2(file);
        }

        // Fallback: if ImageKit configuration exists, attempt to call it dynamically
        try {
            const ImageKit = (await import('imagekit-javascript')).default;
            const imagekit = new ImageKit({
                publicKey: import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || 'dummy_key',
                urlEndpoint: import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/dummy',
                authenticationEndpoint: import.meta.env.VITE_IMAGEKIT_AUTH_ENDPOINT || 'http://localhost:3000/auth',
            });
            return await new Promise((resolve, reject) => {
                imagekit.upload({ file, fileName, folder, useUniqueFileName: true }, (err, result) => {
                    if (err) reject(err); else resolve(result.url);
                });
            });
        } catch (err) {
            console.warn('No ImageKit and R2 not configured; upload not available', err);
            throw new Error('No upload provider configured');
        }
    },

    getOptimizedUrl: (path, width = 800, quality = 80) => {
        if (!path) return '';
        if (R2_PUBLIC) {
            // If path already looks like a full URL, return it
            try {
                const url = new URL(path);
                return path;
            } catch (e) {
                // build R2 URL
                const base = R2_PUBLIC.replace(/\/+$/, '');
                const p = path.replace(/^\/+/, '');
                // Append width/quality as query hints (may be used by your CDN/edge worker)
                return `${base}/${encodeURIComponent(p)}${width ? `?w=${width}&q=${quality}` : ''}`;
            }
        }

        // Fallback: return path unchanged
        return path;
    }
};
