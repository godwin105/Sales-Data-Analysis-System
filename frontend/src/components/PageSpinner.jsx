import { useTranslation } from 'react-i18next';

/**
 * Loading indicator for pages while data is being fetched.
 */
export default function PageSpinner({ label }) {
  const { t } = useTranslation();
  const text = label || t('common.loading');
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}
