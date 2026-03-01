import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallPrompt, setShowInstallPrompt] = useState(false);
    const [showIosPrompt, setShowIosPrompt] = useState(false);

    useEffect(() => {
        // Sprawdzenie czy już zainstalowana (PWA flagi)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone || document.referrer.includes('android-app://');

        const dismissed = localStorage.getItem('pwa_prompt_dismissed');

        if (isStandalone || dismissed === 'true') {
            return;
        }

        // Obsługa standardowego zdarzenia beforeinstallprompt (Android / Chrome / Edge)
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Wykrywanie iOS Safari, gdyż silnik WebKit nie wspiera beforeinstallprompt.
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIos = /iphone|ipad|ipod/.test(userAgent);
        const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

        if (isIos && isSafari && !isStandalone) {
            // Skromne opóźnienie pokazania baneru dla iOS (dobra praktyka PWA)
            setTimeout(() => {
                setShowIosPrompt(true);
            }, 3000);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowInstallPrompt(false);
        }

        setDeferredPrompt(null);
    };

    const dismissPrompt = () => {
        localStorage.setItem('pwa_prompt_dismissed', 'true');
        setShowInstallPrompt(false);
        setShowIosPrompt(false);
    };

    if (!showInstallPrompt && !showIosPrompt) return null;

    return (
        <div className="absolute bottom-[80px] left-4 right-4 z-[100] bg-[#1a1a1a]/95 backdrop-blur-xl border border-primary/30 p-4 rounded-2xl shadow-[0_-5px_40px_-15px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-10 duration-500">
            <div className="flex items-center gap-3 flex-1">
                <div className="bg-primary/20 p-2.5 rounded-xl text-primary flex-shrink-0 border border-primary/30">
                    <Download size={24} />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-white font-bold text-[14px] leading-tight">Zainstaluj aplikację TEB</span>
                    {showInstallPrompt ? (
                        <span className="text-gray-400 text-[11px] leading-tight pr-2">Używaj bezpośrednio z ekranu telefonu i powiadomień.</span>
                    ) : (
                        <span className="text-gray-400 text-[10px] leading-tight pr-1">Wciśnij ikonę "Udostępnij" poniżej w pasku Safari i wybierz opcję "Do ekranu początkowego".</span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {showInstallPrompt && (
                    <button
                        onClick={handleInstallClick}
                        className="bg-primary text-white text-[13px] font-bold px-3 py-2 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95 transition"
                    >
                        Pobierz
                    </button>
                )}
                <button onClick={dismissPrompt} className="p-1.5 text-gray-500 bg-gray-800/50 hover:bg-gray-800 rounded-full transition active:scale-95">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
