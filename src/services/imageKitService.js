import { uploadImageToR2 } from './r2Upload';

const R2_PUBLIC = import.meta.env.VITE_R2_PUBLIC_URL || import.meta.env.NEXT_PUBLIC_R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || '';

// Legacy name preserved for compatibility with existing imports.
// This service now prefers Cloudflare R2; ImageKit has been removed.
export const ImageKitService = {
    upload: async (file, fileName, folder = 'general') => {
        if (!R2_PUBLIC) {
            throw new Error('No upload provider configured. Set VITE_R2_PUBLIC_URL to enable uploads.');
        }
        return await uploadImageToR2(file);
    },

    // For display URLs: if path is already absolute return as-is, otherwise prefix with R2 public base.
    getOptimizedUrl: (path, width = 800, quality = 80) => {
        if (!path) return '';
        try {
            // if it's already a full URL, just return it
            const url = new URL(path);
            return path;
        } catch (e) {
            if (!R2_PUBLIC) return path;
            const base = R2_PUBLIC.replace(/\/+$/, '');
            const p = path.replace(/^\/+/, '');
            // Append query hints (not required for R2 but may be useful for downstream CDN)
            return `${base}/${encodeURIComponent(p)}${width ? `?w=${width}&q=${quality}` : ''}`;
        }
    }
};
