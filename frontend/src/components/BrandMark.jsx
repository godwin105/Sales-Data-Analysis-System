import { useTranslation } from 'react-i18next';


export default function BrandMark({ size = 'md', tagline = true }) {
  const { t } = useTranslation();
  const sizes = {
    sm: { logoBox: 'w-8 h-8',  title: 'text-base' },
    md: { logoBox: 'w-12 h-12', title: 'text-xl' },
    lg: { logoBox: 'w-14 h-14', title: 'text-2xl' },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src="/favicon.svg"
        alt={t('brand.shortName')}
        className={`${s.logoBox} shadow-md`}
        draggable={false}
      />
      <div className="text-center">
        <div className={`${s.title} font-bold text-slate-800 dark:text-slate-100`}>
          {t('brand.title')}
        </div>
      </div>
    </div>
  );
}
