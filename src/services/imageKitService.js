import { supabase } from './supabase';

const IMAGEKIT_ENDPOINT = import.meta.env.IMAGEKIT_URL_ENDPOINT || import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '';
const OPTIMIZED_URL_CACHE_LIMIT = 1000;
const optimizedUrlCache = new Map();

function rememberOptimizedUrl(cacheKey, value) {
    if (optimizedUrlCache.size >= OPTIMIZED_URL_CACHE_LIMIT) {
        const oldestKey = optimizedUrlCache.keys().next().value;
        if (oldestKey) optimizedUrlCache.delete(oldestKey);
    }
    optimizedUrlCache.set(cacheKey, value);
    return value;
}

export const ImageKitService = {
    upload: async (file, fileName, folder = '') => {
        if (!file) throw new Error('No file provided');

        // Plik jest już skompresowany przez MediaUploader — brak podwójnej kompresji
        const toUpload = file;

        // Get authentication parameters from server (requires valid session)
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token || '';
        const folderQuery = folder ? `?folder=${encodeURIComponent(folder)}` : '';
        const authRes = await fetch(`/api/imagekit-auth${folderQuery}`, {
            headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
        });
        if (!authRes.ok) {
            const text = await authRes.text().catch(() => '');
            const err = new Error('Failed to get ImageKit auth: ' + (text || authRes.status));
            err.status = authRes.status;
            err.body = text;
            throw err;
        }
        let auth;
        try {
            auth = await authRes.json();
        } catch (jsonErr) {
            const err = new Error('Failed to parse ImageKit auth response: ' + jsonErr.message);
            err.status = 500;
            throw err;
        }
        if (!auth || !auth.publicKey) {
            throw new Error('ImageKit auth response missing required fields');
        }

        const form = new FormData();
        form.append('file', toUpload);
        form.append('fileName', fileName || `upload_${Date.now()}.webp`);
        if (folder) form.append('folder', folder);
        if (auth.publicKey) form.append('publicKey', auth.publicKey);
        if (auth.signature) form.append('signature', auth.signature);
        if (auth.token) form.append('token', auth.token);
        if (auth.expire) form.append('expire', auth.expire);

        const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: form });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            const err = new Error('ImageKit upload failed: ' + (text || res.status));
            err.status = res.status;
            err.body = text;
            throw err;
        }
        let body;
        try {
            body = await res.json();
        } catch (jsonErr) {
            const err = new Error('Failed to parse ImageKit upload response: ' + jsonErr.message);
            err.status = 500;
            throw err;
        }
        if (!body.url && (!body.filePath || !auth.urlEndpoint)) {
            throw new Error('ImageKit upload response missing file URL');
        }
        // Prefer full url returned by ImageKit
        return body.url || `${auth.urlEndpoint.replace(/\/+$/, '')}${body.filePath}`;
    },

    getOptimizedUrl: (path, width = null) => {
        if (!path) return '';
        const cleanPath = String(path).trim();
        if (!cleanPath) return '';
        const normalizedWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Math.round(Number(width)) : null;
        const transformValue = normalizedWidth ? `w-${normalizedWidth},q-auto,f-auto` : 'w-auto,q-auto,f-auto';
        const cacheKey = `${cleanPath}::${transformValue}`;

        if (optimizedUrlCache.has(cacheKey)) {
            return optimizedUrlCache.get(cacheKey);
        }

        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
            try {
                const parsed = new URL(cleanPath)
                const host = parsed.hostname.toLowerCase()
                const isImageKitHost = host.endsWith('imagekit.io')
                const hasTransform = parsed.searchParams.has('tr')
                if (isImageKitHost && !hasTransform) {
                    parsed.searchParams.set('tr', transformValue)
                    return rememberOptimizedUrl(cacheKey, parsed.toString())
                }
            } catch {
                return rememberOptimizedUrl(cacheKey, cleanPath)
            }
            return rememberOptimizedUrl(cacheKey, cleanPath);
        }

        if (!IMAGEKIT_ENDPOINT) return rememberOptimizedUrl(cacheKey, cleanPath);
        const base = IMAGEKIT_ENDPOINT.replace(/\/+$/, '');
        const normalizedPath = cleanPath.replace(/^\/+/, '');
        const q = normalizedPath.includes('?') ? '&' : '?';
        return rememberOptimizedUrl(cacheKey, `${base}/${normalizedPath}${q}tr=${transformValue}`);
    }
};
