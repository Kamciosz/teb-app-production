import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { uploadImageToR2 } from '../../services/r2Upload';
import { useToast } from '../../context/ToastContext';
import { Upload, X, Loader2, FileWarning } from 'lucide-react';

/**
 * Inteligentny Uploader z kompresją WebP
 * @param {string} module - 'profiles' | 'rewear' | 'tebtalk' | 'articles'
 * @param {Function} onUploadSuccess - zwraca URL do zapisu w DB
 */
const MediaUploader = ({ module = 'general', onUploadSuccess, children }) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    // Limity modułów zgodnie ze strategią Beta 3.2
    const config = {
        profiles: { maxSizeMB: 0.01, maxWidthOrHeight: 200, quality: 0.7 }, // ~10 KB
        rewear: { maxSizeMB: 0.1, maxWidthOrHeight: 800, quality: 0.8 },   // ~100 KB
        tebtalk: { maxSizeMB: 0.07, maxWidthOrHeight: 600, quality: 0.7 },  // ~50-70 KB
        articles: { maxSizeMB: 0.3, maxWidthOrHeight: 1000, quality: 0.8 }, // ~300 KB
        general: { maxSizeMB: 0.3, maxWidthOrHeight: 1000, quality: 0.8 }
    }[module];

    const toast = useToast();

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. Blokada formatów (Pracuj mądrze, nie ciężko)
        const blockedExtensions = ['txt', 'sql', 'exe', 'bin'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (blockedExtensions.includes(ext) || !file.type.startsWith('image/')) {
            setError("Niedozwolony format pliku! Wybierz zdjęcie.");
            return;
        }

        setError(null);
        setUploading(true);

            try {
            // 2. Kompresja na telefonie ucznia (Oszczędzanie transferu)
            const options = {
                maxSizeMB: config.maxSizeMB,
                maxWidthOrHeight: config.maxWidthOrHeight,
                useWebWorker: true,
                fileType: 'image/webp' // Konwersja wymuszona do WebP
            };

            const compressedFile = await imageCompression(file, options);

            // 3. Wysyłka do CDN
                const fileName = `${module}_${Date.now()}.webp`;
                let url = null;
                // Prefer Cloudflare R2 when configured (server endpoint will provide presigned URL)
                url = await uploadImageToR2(compressedFile);

            if (onUploadSuccess) onUploadSuccess(url);
        } catch (err) {
            console.error("Upload error:", err);
            // Show contextual toasts for known server-side statuses
            const status = err && err.status ? err.status : null;
            if (status === 429) {
                toast.error('Przekroczono limit przesyłania plików. Spróbuj ponownie później.');
                setError('Przekroczono limit przesyłania plików.');
            } else if (status === 413) {
                toast.error('Plik jest za duży dla Twojego konta.');
                setError('Plik za duży.');
            } else if (status === 401 || status === 403) {
                toast.error('Nieautoryzowane. Zaloguj się ponownie.');
                setError('Nieautoryzowane.');
            } else {
                toast.error('Wgrywanie nie powiodło się. Spróbuj ponownie.');
                setError('Błąd podczas wgrywania zdjęcia.');
            }
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="media-uploader-container">
            <label className={`cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    hidden
                    disabled={uploading}
                />

                {children ? (
                    uploading ? (
                        <div className="w-9 h-9 flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={20} />
                        </div>
                    ) : (
                        children
                    )
                ) : (
                    <div className={`upload-box ${uploading ? 'uploading' : ''}`}>
                        {uploading ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="animate-spin mb-2" />
                                <span className="text-sm">Kompresowanie...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center cursor-pointer">
                                <Upload size={32} className="text-blue-500 mb-2" />
                                <span className="text-sm font-medium">Dodaj zdjęcie</span>
                                <span className="text-xs text-gray-400 mt-1">
                                    Format: WebP zoptymalizowany
                                </span>
                                {module === 'articles' && (
                                    <span className="text-[10px] text-primary mt-1">
                                        Filmy: Wklej link YT w treści
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </label>

            {error && (
                <div className="mt-2 flex items-center text-red-500 text-xs gap-1">
                    <FileWarning size={14} />
                    {error}
                </div>
            )}

            {!children && (
                <style jsx>{`
                    .upload-box {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 2px dashed rgba(255, 255, 255, 0.1);
                        border-radius: 16px;
                        padding: 24px;
                        background: rgba(255, 255, 255, 0.05);
                        backdrop-filter: blur(10px);
                        transition: all 0.2s ease;
                    }
                    .upload-box:hover {
                        border-color: #3b82f6;
                        background: rgba(59, 130, 246, 0.05);
                    }
                    .uploading {
                        opacity: 0.7;
                        cursor: wait;
                    }
                `}</style>
            )}
        </div>
    );
};

export default MediaUploader;
