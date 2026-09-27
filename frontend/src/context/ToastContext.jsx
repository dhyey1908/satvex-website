import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon, InfoIcon, CloseIcon } from '../components/Icons';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircleIcon,
  error: AlertCircleIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
};

const DEFAULT_DURATIONS = {
  success: 3500,
  error: 5000,
  warning: 4500,
  info: 3500,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const showToast = useCallback(
    (message, type = 'success', duration) => {
      const resolvedType = ICONS[type] ? type : 'success';
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type: resolvedType, leaving: false }]);
      window.setTimeout(() => dismiss(id), duration ?? DEFAULT_DURATIONS[resolvedType]);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div key={t.id} className={`toast ${t.type} ${t.leaving ? 'leaving' : ''}`} role="status">
              <Icon className="toast-icon" />
              <span className="toast-message">{t.message}</span>
              <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
