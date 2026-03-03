import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext();

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type, duration }]);

        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const value = {
        addToast,
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        warning: (msg) => addToast(msg, 'warning'),
        info: (msg) => addToast(msg, 'info')
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[9999] pointer-events-none w-full max-w-sm px-4">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-300 ${
                            toast.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                            toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                            toast.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                            'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                    >
                        {toast.type === 'success' && <CheckCircle size={20} className="shrink-0" />}
                        {toast.type === 'error' && <X size={20} className="shrink-0" />}
                        {toast.type === 'warning' && <AlertTriangle size={20} className="shrink-0" />}
                        {toast.type === 'info' && <Info size={20} className="shrink-0" />}
                        
                        <span className="text-sm font-bold flex-1">{toast.message}</span>
                        
                        <button onClick={() => removeToast(toast.id)} className="opacity-50 hover:opacity-100 p-1">
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
