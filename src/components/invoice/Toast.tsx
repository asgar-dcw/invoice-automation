import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { Toast as ToastType } from '../../types/invoice';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: {
      bg: 'bg-emerald-600',
      icon: CheckCircle2,
    },
    error: {
      bg: 'bg-red-600',
      icon: AlertCircle,
    },
    info: {
      bg: 'bg-blue-600',
      icon: Info,
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div className={`${config.bg} text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 min-w-[280px] max-w-md slide-up`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="font-medium text-sm flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
