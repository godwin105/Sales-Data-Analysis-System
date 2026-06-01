import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';


export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  onConfirm,
  onCancel,
  busy = false,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  const confirmClass =
    variant === 'danger' ? 'btn-danger' :
    variant === 'success' ? 'btn-success' : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            {variant === 'danger' && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertTriangle className="text-danger" size={20} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
              {message && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{message}</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={busy}
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmClass}
            disabled={busy}
          >
            {busy ? t('common.working') : (confirmLabel || t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
