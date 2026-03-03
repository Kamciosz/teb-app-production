import ImageKit from "imagekit-javascript";

// Konfiguracja ImageKit
// Dane powinny być docelowo w pliku .env
const imagekit = new ImageKit({
    publicKey: import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || "",
    urlEndpoint: import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "",
    authenticationEndpoint: import.meta.env.VITE_IMAGEKIT_AUTH_ENDPOINT || "",
});

/**
 * Serwis do obsługi mediów przez ImageKit.io
 */
export const ImageKitService = {
    /**
     * Wgrywa plik bezpośrednio do ImageKit
     * @param {File} file - Przetworzony plik (np. WebP po kompresji)
     * @param {string} fileName - Nazwa pliku
     * @param {string} folder - Folder docelowy (np. 'profiles', 'rewear')
     */
    upload: async (file, fileName, folder = "general") => {
        try {
            return new Promise((resolve, reject) => {
                imagekit.upload({
                    file: file,
                    fileName: fileName,
                    folder: folder,
                    useUniqueFileName: true,
                }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result.url); // Zwracamy czysty link do zapisu w Supabase
                });
            });
        } catch (error) {
            console.error("ImageKit Upload Error:", error);
            throw error;
        }
    },

    /**
     * Generuje zoptymalizowany URL dla obrazka
     * @param {string} path - Ścieżka/URL bazowy
     * @param {number} width - Docelowa szerokość
     * @param {number} quality - Jakość (0-100)
     */
    getOptimizedUrl: (path, width = 800, quality = 80) => {
        if (!path) return "";
        return imagekit.url({
            src: path,
            transformation: [{
                width: width.toString(),
                quality: quality.toString()
            }]
        });
    }
};
