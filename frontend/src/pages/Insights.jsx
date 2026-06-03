import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../components/EmptyState';

export default function Insights() {
  const { t } = useTranslation();

  return (
    <div className="card max-w-4xl">
      <EmptyState
        icon={TrendingUp}
        title={t('insights.comingSoonTitle')}
        message={t('insights.comingSoonMessage')}
      />
    </div>
  );
}
