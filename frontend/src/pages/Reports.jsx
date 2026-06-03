import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../components/EmptyState';

export default function Reports() {
  const { t } = useTranslation();

  return (
    <div className="card max-w-4xl">
      <EmptyState
        icon={FileText}
        title={t('reports.comingSoonTitle')}
        message={t('reports.comingSoonMessage')}
      />
    </div>
  );
}
