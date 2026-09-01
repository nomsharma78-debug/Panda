'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((msg, dur) => addToast('success', msg, dur), [addToast]);
  const error = useCallback((msg, dur) => addToast('error', msg, dur), [addToast]);
  const info = useCallback((msg, dur) => addToast('info', msg, dur), [addToast]);
  const warning = useCallback((msg, dur) => addToast('warning', msg, dur), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info, warning }}>
      {children}
      {/* Toast Notification Container - Mobile Responsive */}
      <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:bottom-5 sm:right-5 z-50 flex flex-col gap-2 max-w-sm w-auto pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl shadow-modal border backdrop-blur-md text-xs sm:text-sm transition-all duration-300 animate-slide-up ${
              t.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-emerald-300'
                : t.type === 'error'
                ? 'bg-slate-900/95 border-rose-500/40 text-rose-300'
                : t.type === 'warning'
                ? 'bg-slate-900/95 border-amber-500/40 text-amber-300'
                : 'bg-slate-900/95 border-teal-500/40 text-teal-300'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {t.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-teal-400 shrink-0" />}
              <span className="font-medium text-slate-100 text-xs sm:text-sm leading-snug break-words">
                {t.message}
              </span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg shrink-0"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
