import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const VARIANTS = {
  success: { Icon: CheckCircle2, classes: 'bg-green-50 border-green-300 text-green-800 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200' },
  error:   { Icon: AlertCircle,  classes: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200' },
  warning: { Icon: AlertTriangle, classes: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200' },
  info:    { Icon: Info,         classes: 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200' },
};

const DEFAULT_DURATION = 1000;
const MAX_VISIBLE_TOASTS = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((variant, message, duration = DEFAULT_DURATION) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => {
      const deduped = prev.filter((t) => t.message !== message || t.variant !== variant);
      return [...deduped, { id, variant, message }].slice(-MAX_VISIBLE_TOASTS);
    });
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const value = {
    success: (msg, dur) => push('success', msg, dur),
    error:   (msg, dur) => push('error', msg, dur),
    warning: (msg, dur) => push('warning', msg, dur),
    info:    (msg, dur) => push('info', msg, dur),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts, dismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[1000] pointer-events-none flex flex-col-reverse gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto">
      {toasts.map((t) => {
        const v = VARIANTS[t.variant] || VARIANTS.info;
        const Icon = v.Icon;
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex items-start gap-3 px-3.5 py-2.5 rounded-md border shadow-lg ${v.classes} animate-[slideIn_0.18s_ease-out]`}
          >
            <Icon size={20} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto flex-shrink-0 hover:opacity-70 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
