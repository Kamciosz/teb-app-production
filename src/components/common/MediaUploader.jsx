import React, { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { ImageKitService } from '../../services/imageKitService';
import { useToast } from '../../context/ToastContext';
import { Upload, Loader2, FileWarning } from 'lucide-react';

/**
 * Inteligentny Uploader z kompresją WebP
 * @param {string} module - 'profiles' | 'rewear' | 'tebtalk' | 'articles'
 * @param {Function} onUploadSuccess - zwraca URL do zapisu w DB
 */
const MediaUploader = ({ module = 'general', onUploadSuccess, children }) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    // Otwiera natywne okno wyboru pliku — ref+click działa niezawodnie na PC i mobile
    const openFilePicker = (e) => {
        if (e) e.preventDefault();
        if (!uploading) fileInputRef.current?.click();
    };

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
        // Reset — pozwala wybrać ten sam plik ponownie
        e.target.value = '';

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
                // Cap any module-specific max dimension to 1920px to avoid huge uploads
                maxWidthOrHeight: Math.min(config.maxWidthOrHeight || 1920, 1920),
                useWebWorker: false, // false = stabilne na Safari iOS i Android WebView
                fileType: 'image/webp', // Konwersja wymuszona do WebP
                initialQuality: config.quality || 0.8
            };

            const compressedFile = await imageCompression(file, options);

            // 3. Wysyłka do CDN
                const fileName = `${module}_${Date.now()}.webp`;
                let url = null;
                // Upload to ImageKit via signed server auth
                url = await ImageKitService.upload(compressedFile, fileName, module);

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
            {/* Input ukryty przez CSS — nie przez atrybut hidden, który blokuje klik na niektórych przeglądarkach */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={uploading}
            />

            {children ? (
                /* Tryb z children — np. ikona aparatu w TEBtalk */
                <div
                    onClick={openFilePicker}
                    className={`cursor-pointer select-none ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                >
                    {uploading ? (
                        <div className="w-9 h-9 flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={20} />
                        </div>
                    ) : (
                        children
                    )}
                </div>
            ) : (
                /* Tryb domyślny — duże pole klikalne */
                <div
                    onClick={openFilePicker}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openFilePicker(e)}
                    className={`upload-box select-none ${uploading ? 'uploading' : 'cursor-pointer'}`}
                >
                    {uploading ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="animate-spin mb-2" />
                            <span className="text-sm">Wysyłanie zdjęcia...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <Upload size={32} className="text-blue-500 mb-2" />
                            <span className="text-sm font-medium">Dodaj zdjęcie</span>
                            <span className="text-xs text-gray-400 mt-1">
                                Kliknij lub dotknij, aby wybrać
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

            {error && (
                <div className="mt-2 flex items-center text-red-500 text-xs gap-1">
                    <FileWarning size={14} />
                    {error}
                </div>
            )}

            {!children && (
                <style>{`
                    .upload-box {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 2px dashed rgba(255, 255, 255, 0.1);
                        border-radius: 16px;
                        padding: 24px;
                        background: rgba(255, 255, 255, 0.05);
                        transition: all 0.2s ease;
                        width: 100%;
                        min-height: 100px;
                    }
                    .upload-box:hover {
                        border-color: #3b82f6;
                        background: rgba(59, 130, 246, 0.05);
                    }
                    .uploading {
                        opacity: 0.7;
                        cursor: wait;
                        pointer-events: none;
                    }
                `}</style>
            )}
        </div>
    );
};

export default MediaUploader;
