import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';

export default function ReloadPrompt() {
    const [needRefresh, setNeedRefresh] = useState(false);
    const [offlineReady, setOfflineReady] = useState(false);
    const [waitingWorker, setWaitingWorker] = useState(null);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.getRegistration().then((reg) => {
            if (!reg) return;

            // Kiedy nowa wersja zostanie zainstalowana i czeka "w poczekalni"
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // Mamy już kontroler, więc to aktualizacja aplikacji
                            setWaitingWorker(newWorker);
                            setNeedRefresh(true);
                        } else {
                            // To pierwszy start Service Workera, cacheowanie dobiło do końca
                            setOfflineReady(true);
                        }
                    }
                });
            });

            // Jeśli jakaś wersja już ugrzęzła wcześniej w zawieszeniu (ang. waiting state)
            if (reg.waiting) {
                setWaitingWorker(reg.waiting);
                setNeedRefresh(true);
            }
        });
    }, []);

    const updateServiceWorker = () => {
        if (waitingWorker) {
            // Nakazanie zamrożonemu workerowi przejąć stery strony
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            waitingWorker.addEventListener('statechange', () => {
                if (waitingWorker.state === 'activated') {
                    window.location.reload();
                }
            });
        }
    };

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
        setWaitingWorker(null);
    };

    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] bg-[#1a1a1a]/95 backdrop-blur-xl border border-primary/40 p-4 rounded-2xl shadow-[0_0_50px_-15px_rgba(59,130,246,0.6)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-10 duration-500">
            <div className="flex items-center gap-3 flex-1">
                <div className="bg-primary/20 p-2.5 rounded-xl text-primary flex-shrink-0 animate-pulse">
                    <RefreshCw size={24} className={needRefresh ? "animate-spin-slow" : ""} />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-white font-bold text-[14px] leading-tight">
                        {offlineReady ? 'Pobrano zasoby Offline' : 'Dostępna jest Aktualizacja!'}
                    </span>
                    <span className="text-gray-400 text-[11px] leading-tight pr-2">
                        {offlineReady
                            ? 'Aplikacja od teraz zadziała bez internetu.'
                            : 'Pobraliśmy nową wersję w tle. Zainstaluj.'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {needRefresh && (
                    <button
                        onClick={updateServiceWorker}
                        className="bg-primary text-white text-[13px] font-bold px-3 py-2 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.5)] active:scale-95 transition"
                    >
                        Aktualizuj
                    </button>
                )}
                <button onClick={close} className="p-1.5 text-gray-500 bg-gray-800/50 hover:bg-gray-800 rounded-full transition active:scale-95">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
